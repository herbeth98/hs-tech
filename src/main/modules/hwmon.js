// Hardware Monitor: coleta sensores a cada 1 s enquanto a página está aberta.
// Fontes: contadores de desempenho do Windows (CPU por núcleo, discos, rede, memória),
// nvidia-smi (GPU) e StorageReliabilityCounter (temperatura dos discos, a cada 15 s).
const os = require('os');
const { spawn } = require('child_process');
const { decode, lineSplitter, psJson } = require('../ps');

const LOOP = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
# Disco físico -> nome (uma vez)
$names = @{}; Get-PhysicalDisk | ForEach-Object { $names["$($_.DeviceId)"] = $_.FriendlyName }
$temps = @{}; $i = 0
while ($true) {
  if ($i % 15 -eq 0) {
    $temps = @{}
    Get-PhysicalDisk | ForEach-Object { $r = $_ | Get-StorageReliabilityCounter; if ($r -and $r.Temperature -gt 0) { $temps["$($_.DeviceId)"] = $r.Temperature } }
  }
  $cpu = @(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object { $_.Name -notmatch '_Total' } | ForEach-Object {
    @{ n = $_.Name; mhz = [math]::Round($_.ProcessorFrequency * $_.PercentProcessorPerformance / 100); u = [int]$_.PercentProcessorTime } })
  $tot = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
  $disks = @(Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -ne '_Total' } | ForEach-Object {
    $id = ($_.Name -split ' ')[0]
    @{ id = $id; name = $names[$id]; vol = (($_.Name -split ' ', 2)[1]); act = [math]::Max(0, 100 - [double]$_.PercentIdleTime); r = [int64]$_.DiskReadBytesPersec; w = [int64]$_.DiskWriteBytesPersec; t = $temps[$id] } })
  $net = @(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object { $_.BytesTotalPersec -ge 0 } | ForEach-Object {
    @{ name = $_.Name; rx = [int64]$_.BytesReceivedPersec; tx = [int64]$_.BytesSentPersec } })
  $o = @{ cpu = $cpu; util = [int]$tot.PercentProcessorTime; disks = $disks; net = $net } | ConvertTo-Json -Depth 4 -Compress
  [Console]::Out.WriteLine($o); [Console]::Out.Flush()
  $i++
  Start-Sleep -Milliseconds 850
}`;

const GPU_FIELDS = ['name', 'temperature.gpu', 'clocks.gr', 'clocks.mem', 'clocks.video', 'power.draw', 'power.limit', 'utilization.gpu', 'utilization.memory', 'fan.speed', 'memory.used', 'memory.total', 'pstate'];

let ps = null;
let smi = null;
let timer = null;
let listener = null;
let latest = { win: null, gpu: [] };
let meta = null;

const num = (v) => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };

function startSmi() {
  smi = spawn('nvidia-smi', [`--query-gpu=${GPU_FIELDS.join(',')}`, '--format=csv,noheader,nounits', '-lms', '1000'], { windowsHide: true });
  const buf = [];
  const sp = lineSplitter((line) => {
    const v = line.split(',').map((x) => x.trim());
    if (v.length < GPU_FIELDS.length) return;
    const o = {}; GPU_FIELDS.forEach((f, i) => { o[f] = v[i]; });
    buf.push(o);
    // nvidia-smi imprime uma linha por GPU a cada ciclo
    latest.gpu = buf.splice(0, buf.length);
  });
  smi.stdout.on('data', (d) => sp.push(decode(d)));
  smi.on('error', () => { smi = null; });
  smi.on('close', () => { smi = null; });
}

function startPs() {
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LOOP], { windowsHide: true });
  const sp = lineSplitter((line) => { try { latest.win = JSON.parse(line); } catch {} });
  ps.stdout.on('data', (d) => sp.push(decode(d)));
  ps.on('close', () => { ps = null; });
}

/** Monta a árvore Dispositivo > Grupo > Sensor. */
function build() {
  const w = latest.win;
  const tree = [];
  const sensor = (name, value, unit) => ({ name, value, unit });

  // ---------- Processador ----------
  if (w && meta) {
    const arr = (Array.isArray(w.cpu) ? w.cpu : [w.cpu]).filter(Boolean)
      .sort((a, b) => Number(String(a.n).split(',')[1]) - Number(String(b.n).split(',')[1]));
    const byLogical = new Map(arr.map((c) => [Number(String(c.n).split(',')[1]), c]));
    const cores = meta.cores.length ? meta.cores : arr.map((_, i) => ({ threads: [i] }));
    const coreClk = []; const coreUse = [];
    cores.forEach((c, i) => {
      const t = c.threads.map((x) => byLogical.get(x)).filter(Boolean);
      if (!t.length) return;
      coreClk.push(sensor(`Núcleo #${i}`, Math.max(...t.map((x) => x.mhz)), 'MHz'));
      coreUse.push(sensor(`Núcleo #${i}`, Math.round(t.reduce((a, x) => a + x.u, 0) / t.length), '%'));
    });
    const avg = coreClk.length ? Math.round(coreClk.reduce((a, s) => a + s.value, 0) / coreClk.length) : null;
    tree.push({
      id: 'cpu', name: meta.cpu, icon: 'chip', groups: [
        { name: 'Temperaturas', note: 'O Windows não expõe a temperatura deste processador sem um driver de sensor.', sensors: [sensor('Processador (Tctl/Tdie)', null, '°C')] },
        { name: 'Clocks', sensors: [sensor('Média', avg, 'MHz'), ...coreClk] },
        { name: 'Utilização', sensors: [sensor('Processador (total)', w.util, '%'), ...coreUse] }
      ]
    });
  }

  // ---------- Placas de vídeo NVIDIA ----------
  for (const g of latest.gpu) {
    const used = num(g['memory.used']); const total = num(g['memory.total']);
    tree.push({
      id: `gpu-${g.name}`, name: g.name, icon: 'gpu', groups: [
        { name: 'Temperaturas', sensors: [sensor('GPU', num(g['temperature.gpu']), '°C')] },
        { name: 'Clocks', sensors: [sensor('Núcleo (gráficos)', num(g['clocks.gr']), 'MHz'), sensor('Memória', num(g['clocks.mem']), 'MHz'), sensor('Vídeo', num(g['clocks.video']), 'MHz')] },
        { name: 'Energia', sensors: [sensor('Placa inteira', num(g['power.draw']), 'W'), sensor('Limite de potência', num(g['power.limit']), 'W')] },
        { name: 'Utilização', sensors: [sensor('Núcleo da GPU', num(g['utilization.gpu']), '%'), sensor('Controlador de memória', num(g['utilization.memory']), '%'), sensor('VRAM usada', used != null && total ? Math.round(used / total * 100) : null, '%')] },
        { name: 'Memória de vídeo', sensors: [sensor('Usada', used, 'MB'), sensor('Livre', used != null && total != null ? total - used : null, 'MB'), sensor('Total', total, 'MB')] },
        { name: 'Ventoinhas', sensors: [sensor('Ventoinha', num(g['fan.speed']), '%')] }
      ]
    });
  }

  // ---------- Memória ----------
  const tm = os.totalmem(); const fm = os.freemem();
  tree.push({
    id: 'ram', name: `Memória RAM (${(tm / 1073741824).toFixed(0)} GB)`, icon: 'layers', groups: [
      { name: 'Utilização', sensors: [sensor('Memória em uso', Math.round((1 - fm / tm) * 100), '%')] },
      { name: 'Dados', sensors: [sensor('Usada', +((tm - fm) / 1073741824).toFixed(2), 'GB'), sensor('Disponível', +(fm / 1073741824).toFixed(2), 'GB')] }
    ]
  });

  // ---------- Discos ----------
  if (w) {
    const disks = (Array.isArray(w.disks) ? w.disks : [w.disks]).filter(Boolean);
    for (const d of disks) {
      const groups = [];
      if (d.t) groups.push({ name: 'Temperaturas', sensors: [sensor('Temperatura', d.t, '°C')] });
      groups.push({ name: 'Utilização', sensors: [sensor('Tempo ativo', Math.round(d.act), '%')] });
      groups.push({ name: 'Velocidade', sensors: [sensor('Leitura', +(d.r / 1048576).toFixed(2), 'MB/s'), sensor('Escrita', +(d.w / 1048576).toFixed(2), 'MB/s')] });
      tree.push({ id: `disk-${d.id}`, name: `${d.name || `Disco ${d.id}`}${d.vol ? ` (${d.vol})` : ''}`, icon: 'folder', groups });
    }
    // ---------- Rede ----------
    const nets = (Array.isArray(w.net) ? w.net : [w.net]).filter(Boolean)
      .filter((n) => !/isatap|teredo|loopback|pseudo/i.test(n.name));
    for (const n of nets) {
      tree.push({ id: `net-${n.name}`, name: n.name.replace(/\[|\]|_/g, ' ').replace(/\s+/g, ' ').trim(), icon: 'wifi', groups: [
        { name: 'Velocidade', sensors: [sensor('Download', +(n.rx / 1024).toFixed(1), 'KB/s'), sensor('Upload', +(n.tx / 1024).toFixed(1), 'KB/s')] }
      ] });
    }
  }
  return tree;
}

async function start(topology, cpuName, onTick) {
  listener = onTick;
  meta = { cpu: cpuName || 'Processador', cores: topology ? topology.cores : [] };
  if (!ps) startPs();
  if (!smi) startSmi();
  if (!timer) timer = setInterval(() => { if (listener) listener({ t: Date.now(), devices: build() }); }, 1000);
  return true;
}

function stop() {
  listener = null;
  if (timer) clearInterval(timer);
  timer = null;
  for (const p of [ps, smi]) if (p) try { p.kill(); } catch {}
  ps = smi = null;
  latest = { win: null, gpu: [] };
}

module.exports = { start, stop };
