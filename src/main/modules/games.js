// Detecção de jogos instalados e ajustes por jogo (afinidade, prioridade, GPU, tela cheia).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { psJson, runPS } = require('../ps');

// ---------------- Topologia da CPU ----------------
const TOPO_SCRIPT = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class Topo {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetLogicalProcessorInformationEx(int rel, IntPtr buf, ref int len);
  public static List<string> Cores() {
    var list = new List<string>(); int len = 0;
    GetLogicalProcessorInformationEx(0, IntPtr.Zero, ref len);
    IntPtr buf = Marshal.AllocHGlobal(len);
    try {
      if (!GetLogicalProcessorInformationEx(0, buf, ref len)) return list;
      int off = 0;
      while (off < len) {
        IntPtr p = IntPtr.Add(buf, off);
        int size = Marshal.ReadInt32(p, 4);
        byte flags = Marshal.ReadByte(p, 8); byte eff = Marshal.ReadByte(p, 9);
        long mask = Marshal.ReadInt64(p, 32); int grp = Marshal.ReadInt16(p, 40);
        list.Add(grp + "|" + mask + "|" + eff + "|" + flags);
        off += size;
      }
    } finally { Marshal.FreeHGlobal(buf); }
    return list;
  }
}
'@
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name.Trim()
@{ cpu = $cpu; cores = @([Topo]::Cores()) } | ConvertTo-Json -Compress
`;

let topoCache = null;

function bitsOf(mask) {
  const out = [];
  let m = BigInt(mask);
  for (let i = 0n; m > 0n; i++, m >>= 1n) if (m & 1n) out.push(Number(i));
  return out;
}

async function topology() {
  if (topoCache) return topoCache;
  const raw = await psJson(TOPO_SCRIPT);
  const cores = (raw.cores || []).map((s, idx) => {
    const [grp, mask, eff, flags] = s.split('|');
    return { index: idx, group: Number(grp), threads: bitsOf(mask), eff: Number(eff), smt: (Number(flags) & 1) === 1 };
  }).filter((c) => c.group === 0);
  const effs = [...new Set(cores.map((c) => c.eff))];
  const maxEff = Math.max(...effs);
  const hybrid = effs.length > 1;
  const logical = cores.reduce((a, c) => a + c.threads.length, 0);
  const smt = cores.some((c) => c.threads.length > 1);
  const mk = (threads) => threads.reduce((a, t) => a | (1n << BigInt(t)), 0n);
  const sorted = [...cores].sort((a, b) => a.threads[0] - b.threads[0]);
  const pCores = sorted.filter((c) => c.eff === maxEff);
  const masks = {
    all: mk(sorted.flatMap((c) => c.threads)),
    nocore0: mk(sorted.slice(1).flatMap((c) => c.threads)),
    physical: mk(sorted.map((c) => c.threads[0])),
    physicalNoCore0: mk(sorted.slice(1).map((c) => c.threads[0])),
    pcores: mk(pCores.flatMap((c) => c.threads)),
    pcoresPhysical: mk(pCores.map((c) => c.threads[0]))
  };
  topoCache = {
    cpu: raw.cpu, coreCount: sorted.length, logical, smt, hybrid,
    pCoreCount: pCores.length, eCoreCount: sorted.length - pCores.length,
    cores: sorted.map((c) => ({ threads: c.threads, perf: c.eff === maxEff })),
    masks: Object.fromEntries(Object.entries(masks).map(([k, v]) => [k, v.toString(16).toUpperCase()]))
  };
  return topoCache;
}

const AFFINITY_PRESETS = [
  { id: 'default', title: 'Padrão do Windows', desc: 'Todos os núcleos e threads' },
  { id: 'nocore0', title: 'Liberar o núcleo 0', desc: 'O jogo não usa o núcleo 0, que fica para o Windows, drivers e interrupções' },
  { id: 'physical', title: 'Só núcleos físicos (sem SMT/HT)', desc: 'Uma thread por núcleo. Ajuda jogos que sofrem com Hyper-Threading/SMT' },
  { id: 'physicalNoCore0', title: 'Núcleos físicos sem o núcleo 0', desc: 'Combina os dois anteriores' },
  { id: 'pcores', title: 'Só núcleos de desempenho (P-cores)', desc: 'Intel híbrido: tira os E-cores do jogo', hybridOnly: true },
  { id: 'pcoresPhysical', title: 'Só P-cores, sem HT', desc: 'P-cores com uma thread cada', hybridOnly: true },
  { id: 'custom', title: 'Personalizado', desc: 'Escolha as threads à mão' }
];

// ---------------- Detecção de jogos ----------------
function parseVdf(text) {
  // Parser simples para libraryfolders.vdf / appmanifest.acf
  const root = {};
  const stack = [root];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  let key = null;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] === '{') { const o = {}; stack[stack.length - 1][key] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { stack.pop(); }
    else {
      const s = m[1].replace(/\\\\/g, '\\');
      if (key === null) key = s; else { stack[stack.length - 1][key] = s; key = null; }
    }
  }
  return root;
}

async function regQuery(script) {
  try { const r = await psJson(script); return Array.isArray(r) ? r : r ? [r] : []; } catch { return []; }
}

const EXE_SKIP = /(unins|uninstall|setup|install|redist|vcredist|directx|dxsetup|crash|report|helper|launcherpatcher|easyanticheat|eac_|battleye|be_service|ue4prereq|prereq|dotnet|vc_redist|cefprocess|webhelper|notification|updater|update|touchup|cleanup|benchmark|config|settings)/i;

async function findMainExe(dir, name) {
  const found = [];
  async function walk(d, depth) {
    if (depth > 4 || found.length > 400) return;
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(_commonredist|redist|redistributables|directx|support|__installer|installers|easyanticheat|battleye|engine\\extras)$/i.test(e.name)) continue;
        await walk(full, depth + 1);
      } else if (/\.exe$/i.test(e.name) && !EXE_SKIP.test(e.name)) {
        try { const s = await fsp.stat(full); found.push({ path: full, size: s.size, depth }); } catch {}
      }
    }
  }
  await walk(dir, 0);
  if (!found.length) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = norm(name);
  // Siglas: "Counter-Strike 2" -> "cs2", "Grand Theft Auto V" -> "gtav"
  const words = (name || '').replace(/[®™:]/g, ' ').split(/[\s\-_]+/).filter(Boolean);
  const initials = words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('').toLowerCase();
  const score = (f) => {
    const base = path.basename(f.path, '.exe');
    const b = norm(base);
    let sc = Math.log10(f.size + 1) * 10 - f.depth * 2;
    if (n && b.length > 2 && (n.includes(b) || b.includes(n.slice(0, 6)))) sc += 30;
    if (initials.length >= 2 && b === initials) sc += 45;
    if (/shipping|win64|-dx12|dx11/i.test(f.path)) sc += 8;
    if (/launcher/i.test(base)) sc -= 15;
    if (/import|export|tool|editor|server|dedicated|compiler|sdk|vrad|vbsp|vvis|hlmv|studiomdl|dump|symbol|test|demo/i.test(base)) sc -= 30;
    return sc;
  };
  found.sort((a, b) => score(b) - score(a));
  return found[0].path;
}

async function steamGames() {
  const roots = await regQuery(`@((RegGet 'HKCU:\\Software\\Valve\\Steam' 'SteamPath'), (RegGet 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam' 'InstallPath')) | Where-Object { $_ } | ConvertTo-Json -Compress`);
  const steamRoot = roots[0] ? path.normalize(roots[0]) : null;
  if (!steamRoot) return [];
  const libs = new Set([steamRoot]);
  try {
    const vdf = parseVdf(await fsp.readFile(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const lf = vdf.libraryfolders || vdf.LibraryFolders || {};
    for (const v of Object.values(lf)) if (v && typeof v === 'object' && v.path) libs.add(path.normalize(v.path));
  } catch {}
  const games = [];
  for (const lib of libs) {
    const sa = path.join(lib, 'steamapps');
    let files = [];
    try { files = (await fsp.readdir(sa)).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const st = parseVdf(await fsp.readFile(path.join(sa, f), 'utf8')).AppState;
        if (!st || !st.installdir) continue;
        if (/^(Steamworks Common Redistributables|Steam Linux Runtime|Proton|SteamVR)/i.test(st.name || '')) continue;
        const dir = path.join(sa, 'common', st.installdir);
        if (!fs.existsSync(dir)) continue;
        games.push({ id: `steam:${st.appid}`, name: st.name, store: 'Steam', dir, appid: st.appid, size: Number(st.SizeOnDisk || 0) });
      } catch {}
    }
  }
  return games;
}

async function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const games = [];
  let files = [];
  try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.item')); } catch { return games; }
  for (const f of files) {
    try {
      const j = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
      if (!j.InstallLocation || !fs.existsSync(j.InstallLocation)) continue;
      if ((j.AppCategories || []).length && !(j.AppCategories || []).includes('games')) continue;
      games.push({ id: `epic:${j.AppName}`, name: j.DisplayName, store: 'Epic', dir: j.InstallLocation, exe: j.LaunchExecutable ? path.join(j.InstallLocation, j.LaunchExecutable) : null, size: Number(j.InstallSize || 0) });
    } catch {}
  }
  return games;
}

async function registryGames() {
  const rows = await regQuery(`
$o = @()
Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.path) { $o += [pscustomobject]@{ store = 'GOG'; id = "gog:$($p.gameID)"; name = $p.gameName; dir = $p.path; exe = $p.exe } } }
Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.InstallDir) { $o += [pscustomobject]@{ store = 'Ubisoft'; id = "ubi:$($_.PSChildName)"; name = (Split-Path $p.InstallDir.TrimEnd('/','\\') -Leaf); dir = $p.InstallDir; exe = $null } } }
$keys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.Publisher -match 'Electronic Arts|Riot Games|Rockstar Games|Blizzard|Activision|Mojang' -and $_.InstallLocation -and $_.DisplayName -notmatch 'EA app|Origin|Battle\\.net|Riot Client$|Launcher|Vanguard' } | ForEach-Object { $o += [pscustomobject]@{ store = ($_.Publisher -replace ',.*',''); id = "reg:$($_.PSChildName)"; name = $_.DisplayName; dir = $_.InstallLocation; exe = $null } }
@($o) | ConvertTo-Json -Compress`);
  return rows.filter((r) => r.dir && fs.existsSync(r.dir)).map((r) => ({ ...r, exe: r.exe && fs.existsSync(r.exe) ? r.exe : null }));
}

async function xboxGames() {
  const rows = await regQuery(`
@(Get-AppxPackage | Where-Object { $_.SignatureKind -eq 'Store' -and -not $_.IsFramework -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object { [pscustomobject]@{ store = 'Xbox'; id = "xbox:$($_.Name)"; name = $_.Name; dir = $_.InstallLocation; exe = $null } }) | ConvertTo-Json -Compress`);
  return rows;
}

// ---------------- Configurações salvas ----------------
let storeFile = null;
let data = { games: {}, manual: [] };

function init(userDataDir) {
  storeFile = path.join(userDataDir, 'games.json');
  try { data = { games: {}, manual: [], ...JSON.parse(fs.readFileSync(storeFile, 'utf8')) }; } catch {}
}
function save() { if (storeFile) fs.writeFileSync(storeFile, JSON.stringify(data, null, 2)); }

let scanCache = null;

async function scan(force = false) {
  if (scanCache && !force) return merge(scanCache);
  const lists = await Promise.all([steamGames(), epicGames(), registryGames(), xboxGames()].map((p) => p.catch(() => [])));
  const all = lists.flat();
  for (const g of all) {
    if (!g.exe) g.exe = await findMainExe(g.dir, g.name);
  }
  scanCache = all;
  return merge(all);
}

function merge(list) {
  const out = [...list, ...data.manual].map((g) => {
    const saved = data.games[g.id] || {};
    const exe = saved.exe || g.exe || null;
    return { ...g, exe, exeExists: exe ? fs.existsSync(exe) : false, settings: saved };
  });
  const seen = new Set();
  return out.filter((g) => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => a.name.localeCompare(b.name));
}

function addManual(exe) {
  const id = 'manual:' + exe.toLowerCase();
  if (!data.manual.find((g) => g.id === id)) data.manual.push({ id, name: path.basename(exe, '.exe'), store: 'Manual', dir: path.dirname(exe), exe });
  save();
  return id;
}

function removeManual(id) {
  data.manual = data.manual.filter((g) => g.id !== id);
  delete data.games[id];
  save();
}

// ---------------- Aplicar ajustes ----------------
const PRIORITY_IFEO = { normal: null, above: 6, high: 3 };

async function applySettings(game, settings) {
  const exe = settings.exe || game.exe;
  if (!exe) throw new Error('Defina o executável do jogo primeiro.');
  const name = path.basename(exe).replace(/'/g, "''");
  const exeEsc = exe.replace(/'/g, "''");
  const prio = PRIORITY_IFEO[settings.priority || 'normal'];
  const gpu = settings.gpu === 'high' ? 'GpuPreference=2;' : settings.gpu === 'low' ? 'GpuPreference=1;' : null;
  const layers = [];
  if (settings.disableFSO) layers.push('DISABLEDXMAXIMIZEDWINDOWEDMODE');
  if (settings.runAsAdmin) layers.push('RUNASADMIN');
  if (settings.highDpi) layers.push('HIGHDPIAWARE');
  const script = `
$ifeo = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${name}\\PerfOptions'
${prio ? `RegSet $ifeo 'CpuPriorityClass' ${prio}` : `RegDel $ifeo 'CpuPriorityClass'`}
$gp = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
${gpu ? `RegSet $gp '${exeEsc}' '${gpu}' 'String'` : `RegDel $gp '${exeEsc}'`}
$ly = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
${layers.length ? `RegSet $ly '${exeEsc}' '~ ${layers.join(' ')}' 'String'` : `RegDel $ly '${exeEsc}'`}
Write-Output ok`;
  const r = await runPS(script);
  if (r.code !== 0) throw new Error(r.stderr || 'Falha ao gravar no registro');
  data.games[game.id] = { ...settings, exe };
  save();
  return data.games[game.id];
}

async function maskFor(settings) {
  const t = await topology();
  if (!settings.affinity || settings.affinity === 'default') return null;
  if (settings.affinity === 'custom') {
    const threads = settings.customThreads || [];
    if (!threads.length) return null;
    return threads.reduce((a, x) => a | (1n << BigInt(x)), 0n).toString(16).toUpperCase();
  }
  return t.masks[settings.affinity] || null;
}

async function createShortcut(game, desktopDir) {
  const s = data.games[game.id] || {};
  const exe = s.exe || game.exe;
  if (!exe) throw new Error('Executável não definido.');
  const mask = await maskFor(s);
  const prio = s.priority === 'high' ? '/high' : s.priority === 'above' ? '/abovenormal' : '';
  const args = `/c start "" ${mask ? `/affinity ${mask}` : ''} ${prio} /d "${path.dirname(exe)}" "${exe}"`.replace(/\s+/g, ' ');
  const lnk = path.join(desktopDir, `${game.name.replace(/[\\/:*?"<>|]/g, '')} (HS TECH).lnk`);
  const r = await runPS(`
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut('${lnk.replace(/'/g, "''")}')
$s.TargetPath = "$env:WINDIR\\System32\\cmd.exe"
$s.Arguments = '${args.replace(/'/g, "''")}'
$s.WorkingDirectory = '${path.dirname(exe).replace(/'/g, "''")}'
$s.IconLocation = '${exe.replace(/'/g, "''")},0'
$s.WindowStyle = 7
$s.Save()
Write-Output ok`);
  if (r.code !== 0) throw new Error(r.stderr);
  return lnk;
}

async function checkFolder(game) {
  const s = data.games[game.id] || {};
  const exe = s.exe || game.exe;
  const res = { dir: game.dir, exe, exeExists: !!exe && fs.existsSync(exe), dirExists: fs.existsSync(game.dir) };
  if (res.exeExists) {
    const st = await fsp.stat(exe);
    res.exeSize = st.size;
    res.exeModified = st.mtime;
  }
  // Tamanho da pasta e quantidade de arquivos
  let total = 0; let count = 0;
  async function walk(d) {
    let entries; try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f); else { try { total += (await fsp.stat(f)).size; count++; } catch {} }
    }
  }
  if (res.dirExists) await walk(game.dir);
  res.size = total; res.files = count;
  // Drive e tipo de disco
  res.drive = path.parse(game.dir).root;
  const info = await psJson(`$d = Get-Partition -DriveLetter '${res.drive[0]}' -ErrorAction SilentlyContinue | Get-Disk -ErrorAction SilentlyContinue; $pd = Get-PhysicalDisk | Where-Object DeviceId -eq $d.Number; @{ media = "$($pd.MediaType)"; bus = "$($pd.BusType)"; name = $pd.FriendlyName } | ConvertTo-Json -Compress`).catch(() => null);
  res.disk = info;
  // Exclusão no Defender
  const ex = await psJson(`@{ v = @((Get-MpPreference).ExclusionPath) } | ConvertTo-Json -Compress`).catch(() => null);
  res.defenderExcluded = !!(ex && (ex.v || []).some((p) => p && game.dir.toLowerCase().startsWith(String(p).toLowerCase())));
  return res;
}

// ---------------- Vigia: aplica afinidade e prioridade quando o jogo abre ----------------
let watchTimer = null;
const applied = new Set();
let onApplied = () => {};

function listProcesses() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      resolve(out.split(/\r?\n/).filter(Boolean).map((l) => { const c = l.split('","'); return { name: c[0].replace(/^"/, '').toLowerCase(), pid: Number(c[1]) }; }));
    });
  });
}

async function watchTick() {
  const targets = Object.entries(data.games).filter(([, s]) => s.exe && ((s.affinity && s.affinity !== 'default') || s.priority === 'high' || s.priority === 'above'));
  if (!targets.length) return;
  const procs = await listProcesses();
  const alive = new Set(procs.map((p) => p.pid));
  for (const pid of [...applied]) if (!alive.has(pid)) applied.delete(pid);
  for (const [id, s] of targets) {
    const exeName = path.basename(s.exe).toLowerCase();
    for (const p of procs.filter((x) => x.name === exeName && !applied.has(x.pid))) {
      applied.add(p.pid);
      const mask = await maskFor(s);
      const prio = s.priority === 'high' ? 'High' : s.priority === 'above' ? 'AboveNormal' : null;
      await runPS(`$p = Get-Process -Id ${p.pid} -ErrorAction SilentlyContinue; if ($p) { ${mask ? `$p.ProcessorAffinity = [IntPtr]0x${mask};` : ''} ${prio ? `$p.PriorityClass = '${prio}';` : ''} }`);
      onApplied({ id, pid: p.pid, exe: exeName, mask, priority: prio });
    }
  }
}

function startWatcher(cb) {
  if (cb) onApplied = cb;
  if (watchTimer) return;
  watchTimer = setInterval(() => watchTick().catch(() => {}), 4000);
}

module.exports = {
  init, scan, topology, AFFINITY_PRESETS, addManual, removeManual, applySettings, createShortcut, checkFolder, startWatcher,
  getSettings: (id) => data.games[id] || {}
};
