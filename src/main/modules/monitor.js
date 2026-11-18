// Monitor de desempenho: CPU, RAM, GPU, rede e FPS (via PresentMon da Intel).
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { decode, lineSplitter } = require('../ps');

let listeners = new Set();
let timer = null;
let lastCpu = null;
let latest = {};
let smiProc = null;
let perfProc = null;
let pmProc = null;
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

// ---------------- FPS (PresentMon) ----------------
const frames = new Map(); // app -> [{t, ms}]
let pmColumns = null;
let pmError = null;
let pmExe = null;
const IGNORE = /^(dwm|explorer|hs tech|electron|presentmon.*|searchhost|startmenuexperiencehost|shellexperiencehost|textinputhost|applicationframehost|nvidia overlay|nvidia share|steamwebhelper|msedgewebview2|chrome|msedge|firefox|brave|discord|code|systemsettings)\.exe$/i;

function presentMonPath(binDir) {
  pmExe = path.join(binDir, 'PresentMon.exe');
  return fs.existsSync(pmExe) ? pmExe : null;
}

async function downloadPresentMon(binDir, onProgress = () => {}) {
  fs.mkdirSync(binDir, { recursive: true });
  const rel = await fetch('https://api.github.com/repos/GameTechDev/PresentMon/releases/latest', { headers: { 'User-Agent': 'HS-TECH-App', Accept: 'application/vnd.github+json' } }).then((r) => r.json());
  const asset = (rel.assets || []).find((a) => /^PresentMon-[\d.]+-x64\.exe$/i.test(a.name)) || (rel.assets || []).find((a) => /PresentMon.*x64.*\.exe$/i.test(a.name) && !/Setup|\.msi/i.test(a.name));
  if (!asset) throw new Error('Não encontrei o executável do PresentMon na última versão do GitHub.');
  const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'HS-TECH-App' } });
  if (!res.ok) throw new Error('Falha no download: HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const chunks = [];
  let got = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value)); got += value.length;
    onProgress(total ? got / total : 0);
  }
  const dest = path.join(binDir, 'PresentMon.exe');
  fs.writeFileSync(dest, Buffer.concat(chunks));
  pmExe = dest;
  return { path: dest, version: rel.tag_name, size: got };
}

// Quem costuma impedir o Windows de abrir a sessão ETW usada pelo PresentMon
const BLOQUEADORES = [
  ['FACEIT', 'o anti-cheat do FACEIT'],
  ['vgk', 'o anti-cheat Vanguard (Riot)'],
  ['EasyAntiCheat_EOS', 'o Easy Anti-Cheat'],
  ['BEDaisy', 'o BattlEye']
];
let bloqCache = { t: 0, v: null };
function quemBloqueia() {
  if (Date.now() - bloqCache.t < 60000) return bloqCache.v;
  bloqCache = { t: Date.now(), v: achaBloqueador() };
  return bloqCache.v;
}
function achaBloqueador() {
  const { spawnSync } = require('child_process');
  for (const [svc, nome] of BLOQUEADORES) {
    try {
      const r = spawnSync('sc', ['query', svc], { windowsHide: true, timeout: 3000, encoding: 'latin1' });
      if (/\b4\s+RUNNING|\b4\s+EM EXECU/i.test(r.stdout || '')) return nome;
    } catch {}
  }
  return null;
}

let wantFps = false;   // alguém (overlay ou página Monitor) quer FPS: tenta de novo sozinho se cair
let lastTry = 0;

function startPresentMon() {
  wantFps = true;
  if (pmProc || !pmExe || !fs.existsSync(pmExe)) return false;
  lastTry = Date.now();
  pmColumns = null; // o erro anterior fica até o PresentMon realmente começar (evita piscar a cada nova tentativa)
  pmProc = spawn(pmExe, ['--output_stdout', '--stop_existing_session', '--session_name', 'HSTECH_PM'], { windowsHide: true });
  const sp = lineSplitter((line) => {
    const cells = line.split(',');
    if (!pmColumns) {
      if (/Application/i.test(line) && cells.length > 5) {
        const idx = (names) => { for (const n of names) { const i = cells.findIndex((c) => c.trim().toLowerCase() === n.toLowerCase()); if (i >= 0) return i; } return -1; };
        pmError = null;
        pmColumns = {
          app: idx(['Application']),
          pid: idx(['ProcessID']),
          ft: idx(['MsBetweenPresents', 'FrameTime', 'MsBetweenAppStart', 'MsCPUTime']),
          disp: idx(['MsBetweenDisplayChange', 'DisplayedTime', 'MsBetweenDisplayChange']),
          lat: idx(['MsPCLatency', 'MsAllInputToPhotonLatency', 'MsClickToPhotonLatency'])
        };
      } else if (/error|erro|access|denied/i.test(line)) pmError = line.trim();
      return;
    }
    const app = (cells[pmColumns.app] || '').trim();
    if (!app || IGNORE.test(app)) return;
    const ms = parseFloat(cells[pmColumns.ft]);
    if (!(ms > 0 && ms < 1000)) return;
    const lat = pmColumns.lat >= 0 ? parseFloat(cells[pmColumns.lat]) : NaN;
    let arr = frames.get(app);
    if (!arr) { arr = []; frames.set(app, arr); }
    arr.push({ t: Date.now(), ms, lat: lat > 0 ? lat : null });
  });
  pmProc.stdout.on('data', (d) => sp.push(decode(d)));
  let errTxt = '';
  pmProc.stderr.on('data', (d) => { errTxt += decode(d); });
  pmProc.on('close', (code) => {
    pmProc = null;
    if (/access denied|acesso negado/i.test(errTxt)) {
      const quem = quemBloqueia();
      pmError = quem
        ? `FPS bloqueado: ${quem} está ativo e impede a contagem. Feche-o e reinicie o PC.`
        : 'FPS bloqueado: o Windows negou a leitura. Um anti-cheat ou antivírus pode estar impedindo.';
    } else if (code) {
      pmError = (errTxt.trim().split(/\r?\n/)[0] || `PresentMon terminou (código ${code})`).slice(0, 200);
    }
  });
  return true;
}

// Chamado a cada segundo: se o PresentMon caiu e ainda queremos FPS, tenta de novo a cada 15 s
function keepPresentMon() {
  if (wantFps && !pmProc && pmExe && Date.now() - lastTry > 15000) startPresentMon();
}

function stopPresentMon() {
  wantFps = false;
  if (pmProc) {
    try { pmProc.kill(); } catch {}
    pmProc = null;
    // Encerrar o processo não fecha a sessão ETW: feche-a para não acumular sessões no Windows
    try { require('child_process').spawnSync('logman', ['stop', 'HSTECH_PM', '-ets'], { windowsHide: true, timeout: 5000 }); } catch {}
  }
  frames.clear();
}

function fpsStats() {
  const now = Date.now();
  let best = null;
  for (const [app, arr] of frames) {
    while (arr.length && now - arr[0].t > 15000) arr.shift();
    if (!arr.length) { frames.delete(app); continue; }
    const recent = arr.filter((f) => now - f.t <= 1000);
    if (!best || recent.length > best.recent.length) best = { app, arr, recent };
  }
  if (!best || best.recent.length < 2) return pmProc ? { running: true, app: null, error: pmError } : { running: false, error: pmError };
  const avgMs = best.recent.reduce((a, f) => a + f.ms, 0) / best.recent.length;
  const window = best.arr.filter((f) => now - f.t <= 10000).map((f) => f.ms).sort((a, b) => b - a);
  const worst = (pct) => {
    const n = Math.max(1, Math.floor(window.length * pct));
    return 1000 / (window.slice(0, n).reduce((a, b) => a + b, 0) / n);
  };
  const lats = best.recent.map((f) => f.lat).filter((x) => x);
  return {
    running: true,
    app: best.app,
    fps: 1000 / avgMs,
    frametime: avgMs,
    low1: worst(0.01),
    low01: worst(0.001),
    latency: lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : null,
    graph: best.arr.slice(-180).map((f) => f.ms)
  };
}

// ---------------- Loop principal ----------------
function sample(extra) {
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
    fps: (keepPresentMon(), pmProc || frames.size ? fpsStats() : { running: false, error: pmError }),
    ...extra()
  };
}

function start({ baseMhz, nvidia, extra = () => ({}) } = {}) {
  cpuBaseMhz = baseMhz || 0;
  hasNvidia = nvidia;
  if (timer) return;
  cpuUsage();
  if (hasNvidia) startNvidiaSmi();
  startPerfLoop();
  timer = setInterval(() => {
    const s = sample(extra);
    for (const l of listeners) { try { l(s); } catch {} }
  }, 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const p of [smiProc, perfProc]) if (p) try { p.kill(); } catch {}
  smiProc = perfProc = null;
  stopPresentMon();
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

module.exports = { start, stop, subscribe, presentMonPath, downloadPresentMon, startPresentMon, stopPresentMon, isPresentMonRunning: () => !!pmProc };
