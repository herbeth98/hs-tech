// Monitor de desempenho: CPU, RAM, GPU, disco e rede.
const os = require('os');
const { spawn } = require('child_process');
const { decode, lineSplitter } = require('../ps');

let listeners = new Set();
let timer = null;
let lastCpu = null;
let latest = {};
let smiProc = null;
let perfProc = null;
let hasNvidia = null;
let cpuBaseMhz = 0;

function cpuUsage() {
  const cpus = os.cpus();
  const now = cpus.map((c) => c.times);
  let pct = 0;
  if (lastCpu) {
    let idle = 0; let total = 0;
    now.forEach((t, i) => {
      const p = lastCpu[i];
      const tot = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + (t.idle - p.idle);
      idle += t.idle - p.idle; total += tot;
    });
    pct = total ? (1 - idle / total) * 100 : 0;
  }
  lastCpu = now;
  return pct;
}

// Obs.: monitor.js, hwmon.js e gpu.js leem o nvidia-smi cada um por conta própria (campos e intervalos diferentes). Correção de leitura da GPU: confira os três.
function startNvidiaSmi() {
  if (smiProc) return;
  smiProc = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu,clocks.gr,memory.used,memory.total,power.draw,fan.speed', '--format=csv,noheader,nounits', '-lms', '1000'], { windowsHide: true });
  const sp = lineSplitter((line) => {
    const v = line.split(',').map((s) => parseFloat(s));
    if (v.length < 5 || Number.isNaN(v[0])) return;
    latest.gpu = { util: v[0], temp: v[1], clock: v[2], vramUsed: v[3], vramTotal: v[4], power: v[5], fan: v[6], vendor: 'nvidia' };
  });
  smiProc.stdout.on('data', (d) => sp.push(decode(d)));
  smiProc.on('error', () => { hasNvidia = false; smiProc = null; });
  smiProc.on('close', () => { smiProc = null; });
}

function startPerfLoop() {
  if (perfProc) return;
  const needGpu = hasNvidia ? '$false' : '$true';
  const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$needGpu = ${needGpu}
while ($true) {
  $pi = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -ErrorAction SilentlyContinue
  $p = if ($pi -and $pi.ProcessorFrequency) { [math]::Round($pi.ProcessorFrequency * $pi.PercentProcessorPerformance / 100) } else { -1 }
  $g = -1
  if ($needGpu) { $g = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object Name -like '*engtype_3D' | Measure-Object UtilizationPercentage -Sum).Sum }
  $n = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue | Measure-Object BytesReceivedPersec, BytesSentPersec -Sum
  $rx = ($n | Where-Object Property -eq 'BytesReceivedPersec').Sum; $tx = ($n | Where-Object Property -eq 'BytesSentPersec').Sum
  $d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" -ErrorAction SilentlyContinue
  $da = if ($d) { [math]::Max(0, 100 - [double]$d.PercentIdleTime) } else { -1 }
  [Console]::Out.WriteLine("$p|$g|$rx|$tx|$da|$($d.DiskReadBytesPersec)|$($d.DiskWriteBytesPersec)"); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 900
}`;
  perfProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
  const sp = lineSplitter((line) => {
    const [p, g, rx, tx, da, dr, dw] = line.split('|').map((x) => parseFloat(String(x).replace(',', '.')));
    if (!Number.isNaN(p) && p > 0) latest.cpuClock = p; // MHz efetivo (frequência base x % de desempenho)
    if (!Number.isNaN(g) && g >= 0) latest.gpu = { ...(latest.gpu || {}), util: Math.min(100, g), vendor: 'other' };
    if (!Number.isNaN(rx)) latest.net = { rx, tx };
    if (!Number.isNaN(da) && da >= 0) latest.disk = { active: Math.min(100, da), read: dr || 0, write: dw || 0 };
  });
  perfProc.stdout.on('data', (d) => sp.push(decode(d)));
  perfProc.on('close', () => { perfProc = null; });
}

// ---------------- Loop principal ----------------
function sample() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    t: Date.now(),
    cpu: cpuUsage(),
    cpuClock: latest.cpuClock || null,
    ram: ((total - free) / total) * 100,
    ramUsed: total - free,
    ramTotal: total,
    gpu: latest.gpu || null,
    net: latest.net || null,
    disk: latest.disk || null,
  };
}

function start({ baseMhz, nvidia } = {}) {
  cpuBaseMhz = baseMhz || 0;
  hasNvidia = nvidia;
  if (timer) return;
  cpuUsage();
  if (hasNvidia) startNvidiaSmi();
  startPerfLoop();
  timer = setInterval(() => {
    const s = sample();
    for (const l of listeners) { try { l(s); } catch {} }
  }, 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const p of [smiProc, perfProc]) if (p) try { p.kill(); } catch {}
  smiProc = perfProc = null;
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

module.exports = { start, stop, subscribe };
