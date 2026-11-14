// Programas instalados, desinstalação, inicialização e instalação via winget.
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { psJson, runPS, runExe } = require('../ps');

// ---------------- Instalados ----------------
async function installed() {
  const list = await psJson(`
$keys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
@(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.UninstallString -and $_.SystemComponent -ne 1 -and -not $_.ParentKeyName -and $_.ReleaseType -notmatch 'Update|Hotfix' } | ForEach-Object {
  [pscustomobject]@{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; size = [int64]$_.EstimatedSize * 1KB; date = $_.InstallDate; uninstall = $_.UninstallString; quiet = $_.QuietUninstallString; key = $_.PSChildName }
}) | Sort-Object name -Unique | ConvertTo-Json -Compress`);
  return Array.isArray(list) ? list : list ? [list] : [];
}

function uninstall(entry) {
  return new Promise((resolve) => {
    let cmd = entry.uninstall || '';
    const msi = cmd.match(/msiexec(\.exe)?\s+\/[IX]\s*(\{[0-9A-F-]+\})/i);
    if (msi) cmd = `msiexec.exe /x ${msi[2]}`;
    else if (!/^"/.test(cmd) && /\.exe/i.test(cmd) && /\s/.test(cmd.split(/\.exe/i)[0])) {
      // Caminho com espaços sem aspas
      const i = cmd.toLowerCase().indexOf('.exe') + 4;
      cmd = `"${cmd.slice(0, i)}"${cmd.slice(i)}`;
    }
    exec(cmd, { windowsHide: false }, (err) => resolve({ ok: !err || err.code === 0, code: err ? err.code : 0, cmd }));
  });
}

// ---------------- Inicialização ----------------
const APPROVED = {
  HKCU: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved',
  HKLM: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
};

async function startupList() {
  const list = await psJson(`
function St($root, $sub, $name) {
  $v = RegGet "$root\\$sub" $name
  if ($v -is [byte[]] -and $v.Length -gt 0) { return (($v[0] -band 1) -eq 0) }
  return $true
}
$items = @()
$src = @(
  @{ reg = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; root = '${APPROVED.HKCU}'; sub = 'Run'; scope = 'Usuário' },
  @{ reg = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; root = '${APPROVED.HKLM}'; sub = 'Run'; scope = 'Todos os usuários' },
  @{ reg = 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; root = '${APPROVED.HKLM}'; sub = 'Run32'; scope = 'Todos os usuários (32 bits)' }
)
foreach ($s in $src) {
  $k = Get-Item $s.reg -ErrorAction SilentlyContinue
  if (!$k) { continue }
  foreach ($n in $k.GetValueNames()) {
    if (!$n) { continue }
    $items += [pscustomobject]@{ name = $n; command = "$($k.GetValue($n))"; scope = $s.scope; root = $s.root; sub = $s.sub; kind = 'reg'; enabled = (St $s.root $s.sub $n) }
  }
}
$folders = @(
  @{ path = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"; root = '${APPROVED.HKCU}'; scope = 'Pasta Inicializar (usuário)' },
  @{ path = "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"; root = '${APPROVED.HKLM}'; scope = 'Pasta Inicializar (todos)' }
)
foreach ($f in $folders) {
  Get-ChildItem $f.path -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    $items += [pscustomobject]@{ name = $_.Name; command = $_.FullName; scope = $f.scope; root = $f.root; sub = 'StartupFolder'; kind = 'file'; enabled = (St $f.root 'StartupFolder' $_.Name) }
  }
}
@($items) | ConvertTo-Json -Compress`);
  return Array.isArray(list) ? list : list ? [list] : [];
}

async function startupSet(item, enabled) {
  const bytes = enabled ? '0x02,0,0,0,0,0,0,0,0,0,0,0' : '0x03,0,0,0,0,0,0,0,0,0,0,0';
  const name = item.name.replace(/'/g, "''");
  const r = await runPS(`RegSet '${item.root}\\${item.sub}' '${name}' ([byte[]](${bytes})) 'Binary'; Write-Output ok`);
  return r.code === 0;
}

// ---------------- winget ----------------
const CATALOG = [
  { cat: 'Navegadores', items: [
    ['Google.Chrome', 'Google Chrome'], ['Brave.Brave', 'Brave'], ['Mozilla.Firefox', 'Firefox'], ['Opera.OperaGX', 'Opera GX'] ] },
  { cat: 'Jogos', items: [
    ['Valve.Steam', 'Steam'], ['EpicGames.EpicGamesLauncher', 'Epic Games'], ['ElectronicArts.EADesktop', 'EA app'],
    ['Ubisoft.Connect', 'Ubisoft Connect'], ['GOG.Galaxy', 'GOG Galaxy'], ['Blizzard.BattleNet', 'Battle.net'], ['Playnite.Playnite', 'Playnite'] ] },
  { cat: 'Comunicação', items: [
    ['Discord.Discord', 'Discord'], ['Telegram.TelegramDesktop', 'Telegram'], ['9NKSQGP7F2NH', 'WhatsApp', 'msstore'], ['Zoom.Zoom', 'Zoom'], ['TeamSpeakSystems.TeamSpeakClient', 'TeamSpeak'] ] },
  { cat: 'Mídia e criação', items: [
    ['VideoLAN.VLC', 'VLC'], ['Spotify.Spotify', 'Spotify'], ['OBSProject.OBSStudio', 'OBS Studio'], ['Audacity.Audacity', 'Audacity'],
    ['HandBrake.HandBrake', 'HandBrake'], ['GIMP.GIMP.3', 'GIMP'], ['KDE.Krita', 'Krita'] ] },
  { cat: 'Utilitários', items: [
    ['7zip.7zip', '7-Zip'], ['RARLab.WinRAR', 'WinRAR'], ['voidtools.Everything', 'Everything'], ['Microsoft.PowerToys', 'PowerToys'],
    ['Notepad++.Notepad++', 'Notepad++'], ['ShareX.ShareX', 'ShareX'], ['AnyDesk.AnyDesk', 'AnyDesk'], ['qBittorrent.qBittorrent', 'qBittorrent'],
    ['Rufus.Rufus', 'Rufus'], ['Ventoy.Ventoy', 'Ventoy'], ['Bitwarden.Bitwarden', 'Bitwarden'] ] },
  { cat: 'Hardware e monitoramento', items: [
    ['CPUID.CPU-Z', 'CPU-Z'], ['TechPowerUp.GPU-Z', 'GPU-Z'], ['REALiX.HWiNFO', 'HWiNFO'], ['CrystalDewWorld.CrystalDiskInfo', 'CrystalDiskInfo'],
    ['CrystalDewWorld.CrystalDiskMark', 'CrystalDiskMark'], ['Guru3D.Afterburner', 'MSI Afterburner'], ['Guru3D.RTSS', 'RivaTuner Statistics Server'],
    ['Nvidia.NVIDIAApp', 'NVIDIA App'], ['Wagnardsoft.DisplayDriverUninstaller', 'DDU (removedor de driver)'], ['OCBase.OCCT.Personal', 'OCCT (teste de estabilidade)'] ] },
  { cat: 'Desenvolvimento', items: [
    ['Microsoft.VisualStudioCode', 'VS Code'], ['Git.Git', 'Git'], ['OpenJS.NodeJS.LTS', 'Node.js LTS'], ['Python.Python.3.13', 'Python 3.13'], ['Microsoft.WindowsTerminal', 'Windows Terminal'] ] },
  { cat: 'Bibliotecas (essenciais para jogos)', items: [
    ['Microsoft.VCRedist.2015+.x64', 'Visual C++ 2015-2022 x64'], ['Microsoft.VCRedist.2015+.x86', 'Visual C++ 2015-2022 x86'],
    ['Microsoft.DirectX', 'DirectX (runtime legado)'], ['Microsoft.DotNet.DesktopRuntime.8', '.NET Desktop Runtime 8'], ['Microsoft.DotNet.DesktopRuntime.9', '.NET Desktop Runtime 9'],
    ['Oracle.JavaRuntimeEnvironment', 'Java (JRE)'] ] }
];

const PRESETS = {
  gamer: ['Google.Chrome', 'Valve.Steam', 'EpicGames.EpicGamesLauncher', 'Discord.Discord', '7zip.7zip', 'VideoLAN.VLC', 'Microsoft.VCRedist.2015+.x64', 'Microsoft.VCRedist.2015+.x86', 'Microsoft.DirectX', 'Microsoft.DotNet.DesktopRuntime.8'],
  basico: ['Google.Chrome', '7zip.7zip', 'VideoLAN.VLC', 'Microsoft.VCRedist.2015+.x64', 'Microsoft.VCRedist.2015+.x86'],
  tech: ['Brave.Brave', '7zip.7zip', 'VideoLAN.VLC', 'voidtools.Everything', 'Microsoft.PowerToys', 'CPUID.CPU-Z', 'TechPowerUp.GPU-Z', 'REALiX.HWiNFO', 'CrystalDewWorld.CrystalDiskInfo', 'Notepad++.Notepad++']
};

function catalog() {
  return {
    categories: CATALOG.map((c) => ({ cat: c.cat, items: c.items.map(([id, name, source]) => ({ id, name, source: source || 'winget' })) })),
    presets: PRESETS
  };
}

async function wingetAvailable() {
  const r = await runExe('winget', ['--version']);
  return r.code === 0 ? r.stdout.trim() : null;
}

async function installedIds() {
  const file = path.join(os.tmpdir(), `hstech_winget_${Date.now()}.json`);
  await runExe('winget', ['export', '-o', file, '--accept-source-agreements', '--disable-interactivity'], { timeout: 120000 });
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = [];
    for (const s of j.Sources || []) for (const p of s.Packages || []) ids.push(p.PackageIdentifier);
    return ids;
  } catch { return []; } finally { fs.unlink(file, () => {}); }
}

async function install(ids, log = () => {}, registry) {
  const all = CATALOG.flatMap((c) => c.items);
  const results = [];
  for (const id of ids) {
    const meta = all.find((x) => x[0] === id) || [id, id];
    log(`▶ Instalando ${meta[1]}...`);
    const args = ['install', '--id', id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--source', meta[2] || 'winget'];
    let last = '';
    const r = await runExe('winget', args, {
      registry,
      onLine: (l) => {
        const t = l.trim();
        // Ignora as barras de progresso e o spinner do winget
        if (!t || /^[-\\|/█▒\s]+$/.test(t) || /^[█▒]/.test(t) || /\d+(\.\d+)?\s*(KB|MB|GB)\s*\/\s*\d/.test(t)) return;
        if (t === last) return;
        last = t;
        log('   ' + t);
      }
    });
    // 0 = ok; -1978335189 (0x8A15002B) = já instalado / sem atualização
    const ok = r.code === 0 || r.code === -1978335189 || r.code === 2316632107;
    log(ok ? `✓ ${meta[1]} pronto` : `✗ ${meta[1]} falhou (código ${r.code})`);
    results.push({ id, ok, code: r.code });
  }
  return results;
}

// Lê a tabela do "winget upgrade" pelas posições do cabeçalho (funciona em qualquer idioma).
async function upgradable() {
  const r = await runExe('winget', ['upgrade', '--include-unknown', '--accept-source-agreements', '--disable-interactivity'], { timeout: 180000 });
  const lines = r.stdout.split(/\r?\n/).map((l) => l.replace(/^.*\r/, ''));
  const sep = lines.findIndex((l) => /^-{10,}/.test(l.trim()));
  if (sep < 1) return [];
  const header = lines[sep - 1];
  const starts = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(header))) starts.push(m.index);
  if (starts.length < 4) return [];
  const out = [];
  for (const line of lines.slice(sep + 1)) {
    if (!line.trim()) break; // fim da primeira tabela
    if (line.length < starts[2]) continue;
    const col = (i) => line.slice(starts[i], starts[i + 1] !== undefined ? starts[i + 1] : undefined).trim();
    const item = { name: col(0), id: col(1), version: col(2), available: col(3), source: starts[4] !== undefined ? col(4) : '' };
    if (item.id && !/\s/.test(item.id) && item.available) out.push(item);
  }
  return out;
}

async function upgrade(ids, log = () => {}, registry) {
  const results = [];
  for (const id of ids) {
    log(`▶ Atualizando ${id}...`);
    const r = await runExe('winget', ['upgrade', '--id', id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--include-unknown'], {
      registry, onLine: (l) => { const t = l.trim(); if (t && !/^[-\\|/█▒\s]+$/.test(t) && !/^[█▒]/.test(t) && !/\d\s*(KB|MB|GB)\s*\/\s*\d/.test(t)) log('   ' + t); }
    });
    const ok = r.code === 0;
    log(ok ? `✓ ${id} atualizado` : `✗ ${id} falhou (código ${r.code})`);
    results.push({ id, ok });
  }
  return results;
}

async function upgradeAll(log = () => {}, registry) {
  log('▶ Atualizando todos os programas pelo winget...');
  const r = await runExe('winget', ['upgrade', '--all', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--include-unknown'], {
    registry, onLine: (l) => { const t = l.trim(); if (t && !/^[-\\|/█▒\s]+$/.test(t) && !/^[█▒]/.test(t)) log('   ' + t); }
  });
  log(r.code === 0 ? '✓ Atualizações concluídas' : `Concluído com código ${r.code}`);
  return r.code;
}

module.exports = { installed, uninstall, startupList, startupSet, catalog, wingetAvailable, installedIds, install, upgradeAll, upgradable, upgrade };
