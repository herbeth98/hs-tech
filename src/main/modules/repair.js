// Reparo do Windows (SFC, DISM, CHKDSK, rede, Windows Update) e pontos de restauração.
const { runExe, runPS, psJson } = require('../ps');

const REPAIRS = {
  dismCheck: { title: 'DISM: verificação rápida', steps: [['dism.exe', ['/Online', '/Cleanup-Image', '/CheckHealth']]] },
  dismScan: { title: 'DISM: verificação completa', steps: [['dism.exe', ['/Online', '/Cleanup-Image', '/ScanHealth']]] },
  dismRestore: { title: 'DISM: reparar imagem do Windows', steps: [['dism.exe', ['/Online', '/Cleanup-Image', '/RestoreHealth']]] },
  sfc: { title: 'SFC: verificar arquivos do sistema', steps: [['sfc.exe', ['/scannow']]] },
  full: { title: 'Reparo completo (DISM + SFC)', steps: [['dism.exe', ['/Online', '/Cleanup-Image', '/RestoreHealth']], ['sfc.exe', ['/scannow']]] },
  componentCleanup: { title: 'Limpar componentes antigos (WinSxS)', steps: [['dism.exe', ['/Online', '/Cleanup-Image', '/StartComponentCleanup']]] },
  chkdsk: { title: 'CHKDSK: verificar disco C: (online)', steps: [['chkdsk.exe', ['C:', '/scan']]] },
  network: {
    title: 'Redefinir rede', steps: [
      ['ipconfig', ['/flushdns']], ['netsh', ['winsock', 'reset']], ['netsh', ['int', 'ip', 'reset']], ['netsh', ['int', 'ipv6', 'reset']]
    ], note: 'Reinicie o PC para concluir.'
  },
  winUpdate: {
    title: 'Redefinir Windows Update', ps: `
foreach ($s in 'wuauserv','bits','cryptsvc','msiserver') { Write-Output "Parando $s"; Stop-Service $s -Force -ErrorAction SilentlyContinue }
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
if (Test-Path "$env:WINDIR\\SoftwareDistribution") { Rename-Item "$env:WINDIR\\SoftwareDistribution" "SoftwareDistribution.old$stamp" -ErrorAction SilentlyContinue; Write-Output 'SoftwareDistribution renomeada' }
if (Test-Path "$env:WINDIR\\System32\\catroot2") { Rename-Item "$env:WINDIR\\System32\\catroot2" "catroot2.old$stamp" -ErrorAction SilentlyContinue; Write-Output 'catroot2 renomeada' }
foreach ($s in 'wuauserv','bits','cryptsvc','msiserver') { Write-Output "Iniciando $s"; Start-Service $s -ErrorAction SilentlyContinue }
Write-Output 'Windows Update redefinido.'`
  },
  iconCache: {
    title: 'Recriar cache de ícones', ps: `
ie4uinit.exe -show
Stop-Process -Name explorer -Force
Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue
Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer" -Filter 'iconcache_*.db' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Start-Process explorer.exe
Write-Output 'Cache de ícones recriado.'`
  },
  store: { title: 'Reparar a Microsoft Store', ps: `Get-AppxPackage -AllUsers Microsoft.WindowsStore | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" -ErrorAction SilentlyContinue }; Start-Process wsreset.exe; Write-Output 'Store registrada novamente.'` },
  timeSync: { title: 'Sincronizar relógio', ps: `Start-Service w32time -ErrorAction SilentlyContinue; w32tm /resync /force`, cmd: 'w32tm /resync /force' },
  dns: { title: 'Limpar o cache de DNS', steps: [['ipconfig', ['/flushdns']]] },
  renewIp: { title: 'Renovar o endereço IP', steps: [['ipconfig', ['/release']], ['ipconfig', ['/renew']]] },
  printer: {
    title: 'Destravar a impressora', cmd: 'net stop spooler && del %WINDIR%\\System32\\spool\\PRINTERS\\* && net start spooler', ps: `
Write-Output 'Parando o spooler de impressão'
Stop-Service Spooler -Force -ErrorAction SilentlyContinue
$n = @(Get-ChildItem "$env:WINDIR\\System32\\spool\\PRINTERS" -File -ErrorAction SilentlyContinue).Count
Remove-Item "$env:WINDIR\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue
Write-Output "$n documento(s) removido(s) da fila"
Start-Service Spooler -ErrorAction SilentlyContinue
Write-Output 'Spooler reiniciado.'`
  },
  audio: {
    title: 'Reiniciar o áudio do Windows', cmd: 'net stop audiosrv && net stop AudioEndpointBuilder && net start AudioEndpointBuilder && net start audiosrv', ps: `
Write-Output 'Reiniciando os serviços de áudio'
Stop-Service Audiosrv -Force -ErrorAction SilentlyContinue
Restart-Service AudioEndpointBuilder -Force -ErrorAction SilentlyContinue
Start-Service Audiosrv -ErrorAction SilentlyContinue
Write-Output ("Áudio do Windows: " + (Get-Service Audiosrv).Status)`
  },
  weekly: {
    title: 'Revisão semanal', steps: [
      ['chkdsk.exe', ['C:', '/scan']],
      ['dism.exe', ['/Online', '/Cleanup-Image', '/RestoreHealth']],
      ['sfc.exe', ['/scannow']]
    ]
  }
};

// Comando exato mostrado antes de rodar
function cmdOf(r) {
  if (r.cmd) return r.cmd;
  if (r.steps) return r.steps.map(([exe, args]) => [exe.replace(/\.exe$/i, ''), ...args].join(' ')).join(' && ');
  return 'PowerShell';
}
for (const k of ['winUpdate', 'iconCache', 'store']) REPAIRS[k].cmd = {
  winUpdate: 'net stop wuauserv bits cryptsvc msiserver && ren SoftwareDistribution / catroot2 && net start …',
  iconCache: 'ie4uinit -show && apagar IconCache.db && reiniciar o Explorer',
  store: 'Add-AppxPackage -Register WindowsStore\\AppXManifest.xml && wsreset'
}[k];

function list() {
  return Object.entries(REPAIRS).map(([id, r]) => ({ id, title: r.title, note: r.note || null, cmd: cmdOf(r) }));
}

async function run(id, log = () => {}, registry) {
  const r = REPAIRS[id];
  if (!r) throw new Error('Reparo desconhecido');
  log(`▶ ${r.title}`);
  let lastPct = '';
  const onLine = (l) => {
    // DISM e SFC imprimem barras de progresso; mostra só quando muda
    const pct = l.match(/(\d{1,3}(?:[.,]\d)?)\s*%/);
    if (pct && /[=\[\]]|Verifica|Verification|conclu|complete/i.test(l)) {
      const p = pct[1].split(/[.,]/)[0];
      if (p === lastPct) return;
      lastPct = p;
      log(`   ${p}%`);
      return;
    }
    log('   ' + l.trim());
  };
  let ok = true;
  if (r.ps) {
    const x = await runPS(r.ps, { onLine, registry });
    ok = x.code === 0;
  } else {
    for (const [exe, args] of r.steps) {
      log(`> ${exe} ${args.join(' ')}`);
      const x = await runExe(exe, args, { onLine, registry });
      if (x.code !== 0) { ok = false; log(`   (terminou com código ${x.code})`); }
    }
  }
  if (r.note) log(r.note);
  log(ok ? `✓ ${r.title}: concluído` : `${r.title}: terminou com avisos. Veja as mensagens acima.`);
  return ok;
}

async function createRestorePoint(description = 'HS TECH', log = () => {}) {
  log('Criando ponto de restauração...');
  const r = await runPS(`
Enable-ComputerRestore -Drive "$env:SystemDrive\\" -ErrorAction SilentlyContinue
RegSet 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' 'SystemRestorePointCreationFrequency' 0
try { Checkpoint-Computer -Description '${description.replace(/'/g, "''")}' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop; Write-Output 'OK' } catch { Write-Output "ERRO: $($_.Exception.Message)"; exit 2 }`);
  const ok = /OK\s*$/.test(r.stdout.trim());
  log(ok ? '✓ Ponto de restauração criado' : `✗ ${r.stdout.trim()}`);
  return ok;
}

async function listRestorePoints() {
  const r = await psJson(`@(Get-ComputerRestorePoint -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ seq = $_.SequenceNumber; desc = $_.Description; date = ([Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime)).ToString('o') } }) | ConvertTo-Json -Compress`).catch(() => []);
  return (Array.isArray(r) ? r : r ? [r] : []).sort((a, b) => b.seq - a.seq);
}

module.exports = { list, run, createRestorePoint, listRestorePoints };
