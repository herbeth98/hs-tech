// Informações do sistema, check-up e verificação de XMP/EXPO.
const { psJson } = require('../ps');

const INFO_SCRIPT = `
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bb = Get-CimInstance Win32_BaseBoard
$bios = Get-CimInstance Win32_BIOS
$cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$gpus = @()
$classKey = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
$vram = @{}
Get-ChildItem $classKey -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
  if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [int64]$p.'HardwareInformation.qwMemorySize' }
}
foreach ($g in Get-CimInstance Win32_VideoController) {
  $mem = if ($vram.ContainsKey($g.Name)) { $vram[$g.Name] } else { [int64]$g.AdapterRAM }
  $gpus += [pscustomobject]@{ name = $g.Name; vram = $mem; driver = $g.DriverVersion; driverDate = if ($g.DriverDate) { $g.DriverDate.ToString('yyyy-MM-dd') } else { $null }; res = "$($g.CurrentHorizontalResolution)x$($g.CurrentVerticalResolution)"; hz = $g.CurrentRefreshRate }
}
$mods = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { [pscustomobject]@{ cap = [int64]$_.Capacity; speed = $_.Speed; conf = $_.ConfiguredClockSpeed; maker = $_.Manufacturer; part = ($_.PartNumber -as [string]).Trim(); slot = $_.DeviceLocator; type = $_.SMBIOSMemoryType } })
$disks = @(Get-PhysicalDisk | ForEach-Object { [pscustomobject]@{ name = $_.FriendlyName; media = "$($_.MediaType)"; bus = "$($_.BusType)"; health = "$($_.HealthStatus)"; size = [int64]$_.Size } })
$vols = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.Size -gt 0 } | ForEach-Object { [pscustomobject]@{ letter = "$($_.DriveLetter)"; label = $_.FileSystemLabel; size = [int64]$_.Size; free = [int64]$_.SizeRemaining } })
[pscustomobject]@{
  host = $env:COMPUTERNAME
  user = $env:USERNAME
  os = $os.Caption
  version = "$($cv.DisplayVersion)"
  build = "$($cv.CurrentBuild).$($cv.UBR)"
  installDate = $os.InstallDate.ToString('yyyy-MM-dd')
  bootTime = $os.LastBootUpTime.ToString('o')
  manufacturer = $cs.Manufacturer
  model = $cs.Model
  board = "$($bb.Manufacturer) $($bb.Product)"
  bios = "$($bios.SMBIOSBIOSVersion) ($($bios.ReleaseDate.ToString('yyyy-MM-dd')))"
  cpu = $cpu.Name.Trim()
  cores = $cpu.NumberOfCores
  threads = $cpu.NumberOfLogicalProcessors
  cpuMaxMhz = $cpu.MaxClockSpeed
  ramTotal = [int64]$cs.TotalPhysicalMemory
  memory = $mods
  gpus = $gpus
  disks = $disks
  volumes = $vols
} | ConvertTo-Json -Depth 5 -Compress
`;

const JEDEC_BASE = { 26: 2666, 34: 4800 }; // DDR4 / DDR5 até este valor = perfil padrão

function analyzeXmp(info) {
  const mods = info.memory || [];
  if (!mods.length) return { verdict: 'unknown', text: 'Não foi possível ler os pentes de memória.', modules: [] };
  const type = mods[0].type;
  const typeName = type === 34 ? 'DDR5' : type === 26 ? 'DDR4' : type === 24 ? 'DDR3' : 'DDR';
  const conf = Math.min(...mods.map((m) => m.conf || m.speed || 0));
  const rated = Math.max(...mods.map((m) => m.speed || 0));
  const totalGB = mods.reduce((a, m) => a + m.cap, 0) / 1024 ** 3;
  const partSpeed = (() => {
    for (const m of mods) {
      const hit = (m.part || '').match(/(?:^|[^0-9])(3[0-9]{3}|4[0-9]{3}|5[0-9]{3}|6[0-9]{3}|7[0-9]{3}|8[0-9]{3})(?:[^0-9]|$)/);
      if (hit) return Number(hit[1]);
    }
    return null;
  })();
  let verdict = 'ok';
  let text;
  const base = JEDEC_BASE[type] || 0;
  if (rated && conf && conf < rated - 50) {
    verdict = 'warn';
    text = `A memória está rodando a ${conf} MT/s, abaixo dos ${rated} MT/s que ela suporta. O XMP/EXPO provavelmente está desligado. Ative na BIOS.`;
  } else if (partSpeed && conf && partSpeed > conf + 100) {
    verdict = 'warn';
    text = `O código do pente indica ${partSpeed} MT/s, mas ele roda a ${conf} MT/s. Ative o XMP/EXPO na BIOS.`;
  } else if (base && conf <= base) {
    verdict = 'info';
    text = `A memória roda a ${conf} MT/s, a velocidade padrão JEDEC do ${typeName}. Se o seu kit é de frequência maior, ative o XMP/EXPO na BIOS.`;
  } else {
    text = `A memória roda a ${conf} MT/s. O XMP/EXPO parece estar ativo.`;
  }
  const channel = mods.length >= 2 ? 'Dual channel provável' : 'Apenas 1 pente: single channel. Usar 2 pentes iguais melhora o desempenho em jogos.';
  if (mods.length === 1 && verdict === 'ok') verdict = 'info';
  return { verdict, text, channel, typeName, configured: conf, rated, partSpeed, totalGB, modules: mods };
}

const CHECKUP_SCRIPT = `
$r = [ordered]@{}
$os = Get-CimInstance Win32_OperatingSystem
$r.uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
$r.ramTotal = [int64]$os.TotalVisibleMemorySize * 1KB
$r.ramFree = [int64]$os.FreePhysicalMemory * 1KB
$c = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
$r.cSize = [int64]$c.Size; $r.cFree = [int64]$c.SizeRemaining
$r.diskHealth = @(Get-PhysicalDisk | ForEach-Object { "$($_.FriendlyName)|$($_.HealthStatus)|$($_.MediaType)" })
$scheme = (powercfg /getactivescheme) -join ' '
$r.powerPlan = $scheme
$r.gameMode = RegGet 'HKCU:\\Software\\Microsoft\\GameBar' 'AutoGameModeEnabled'
$r.hags = RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' 'HwSchMode'
$r.gameDvr = RegGet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled'
$r.telemetry = RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' 'AllowTelemetry'
$r.diagTrack = "$((Get-Service DiagTrack -ErrorAction SilentlyContinue).StartType)"
try { $mp = Get-MpComputerStatus -ErrorAction Stop; $r.defenderRT = $mp.RealTimeProtectionEnabled; $r.defenderSig = $mp.AntivirusSignatureAge } catch { $r.defenderRT = $null }
$lic = Get-CimInstance SoftwareLicensingProduct -Filter "PartialProductKey IS NOT NULL AND ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" -ErrorAction SilentlyContinue | Select-Object -First 1
$r.activated = if ($lic) { $lic.LicenseStatus -eq 1 } else { $null }
$rp = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber -Descending | Select-Object -First 1
$r.lastRestore = if ($rp) { ([Management.ManagementDateTimeConverter]::ToDateTime($rp.CreationTime)).ToString('o') } else { $null }
$runCount = 0
foreach ($k in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run') {
  $p = Get-Item $k -ErrorAction SilentlyContinue; if ($p) { $runCount += $p.ValueCount }
}
$runCount += @(Get-ChildItem "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup","$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' }).Count
$r.startupCount = $runCount
$tmp = 0; Get-ChildItem $env:TEMP -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $tmp += $_.Length }
$r.tempBytes = $tmp
$pend = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')
$r.rebootPending = $pend
$g = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA|Radeon RX|Arc' } | Select-Object -First 1
if (!$g) { $g = Get-CimInstance Win32_VideoController | Select-Object -First 1 }
$r.gpuName = $g.Name
$r.gpuDriverDate = if ($g.DriverDate) { $g.DriverDate.ToString('o') } else { $null }
$r.copilot = [bool](Get-AppxPackage -Name '*Copilot*' -ErrorAction SilentlyContinue)
$r.recallOff = (RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI' 'DisableAIDataAnalysis') -eq 1
$r | ConvertTo-Json -Depth 4 -Compress
`;

function evaluateCheckup(d, xmp) {
  const items = [];
  const add = (group, title, status, detail, fix) => items.push({ group, title, status, detail, fix });
  const GB = 1024 ** 3;

  const freePct = d.cSize ? (d.cFree / d.cSize) * 100 : 100;
  add('Armazenamento', 'Espaço Livre no C:', freePct < 8 ? 'bad' : freePct < 15 ? 'warn' : 'ok',
    `${(d.cFree / GB).toFixed(1)} GB livres de ${(d.cSize / GB).toFixed(0)} GB (${freePct.toFixed(0)}%)`, freePct < 15 ? 'clean' : null);
  const HEALTH = { Healthy: 'saudável', Warning: 'com alerta', Unhealthy: 'com defeito', Unknown: 'desconhecido' };
  const disks = (d.diskHealth || []).map((line) => { const [name, health, media] = line.split('|'); return { name, health, media }; });
  const badDisks = disks.filter((x) => x.health !== 'Healthy');
  if (disks.length) {
    add('Armazenamento', 'Saúde dos Discos', badDisks.length ? 'bad' : 'ok',
      badDisks.length
        ? badDisks.map((x) => `${x.name}: ${HEALTH[x.health] || x.health}`).join(' · ')
        : `${disks.length} disco(s), todos saudáveis (${disks.map((x) => x.media === 'HDD' ? 'HD' : x.media).join(', ')})`, null);
  }
  const tempMB = (d.tempBytes || 0) / 1024 ** 2;
  add('Armazenamento', 'Arquivos Temporários', tempMB > 2048 ? 'warn' : 'ok', `${tempMB.toFixed(0)} MB na pasta TEMP`, tempMB > 500 ? 'clean' : null);

  const ramUse = d.ramTotal ? (1 - d.ramFree / d.ramTotal) * 100 : 0;
  add('Memória', 'Uso de RAM Agora', ramUse > 85 ? 'warn' : 'ok', `${ramUse.toFixed(0)}% de ${(d.ramTotal / GB).toFixed(0)} GB`, null);
  add('Memória', 'RAM Total', d.ramTotal / GB < 12 ? 'warn' : 'ok', `${(d.ramTotal / GB).toFixed(0)} GB${d.ramTotal / GB < 12 ? ' (16 GB é o mínimo recomendado para jogos)' : ''}`, null);
  if (xmp) add('Memória', 'XMP / EXPO', xmp.verdict === 'warn' ? 'warn' : 'ok', xmp.text, 'xmp');
  if (xmp && xmp.modules && xmp.modules.length === 1) add('Memória', 'Canal da Memória', 'warn', xmp.channel, null);

  const plan = d.powerPlan || '';
  const highPlan = /HS TECH|Desempenho|Performance|Ultimate|M[aá]ximo/i.test(plan);
  add('Desempenho', 'Plano de Energia', highPlan ? 'ok' : 'warn', (plan.match(/\((.*)\)/) || [])[1] || plan, highPlan ? null : 'tweaks');
  add('Desempenho', 'Modo de Jogo', d.gameMode === 0 ? 'warn' : 'ok', d.gameMode === 0 ? 'Desativado' : 'Ativado', d.gameMode === 0 ? 'tweaks' : null);
  add('Desempenho', 'Agendamento de GPU Acelerado por Hardware', d.hags === 2 ? 'ok' : 'warn', d.hags === 2 ? 'Ativado' : 'Desativado', d.hags === 2 ? null : 'tweaks');
  add('Desempenho', 'Gravação em Segundo Plano (Game DVR)', d.gameDvr === 0 ? 'ok' : 'warn', d.gameDvr === 0 ? 'Desativada' : 'Ativada: consome desempenho em jogos', d.gameDvr === 0 ? null : 'tweaks');
  add('Desempenho', 'Apps na Inicialização', d.startupCount > 12 ? 'warn' : 'ok', `${d.startupCount} itens iniciam com o Windows`, d.startupCount > 12 ? 'startup' : null);
  add('Desempenho', 'Tempo Ligado', d.uptimeHours > 168 ? 'warn' : 'ok', `${(d.uptimeHours / 24).toFixed(1)} dias desde o último reinício`, null);

  if (d.gpuDriverDate) {
    const ageDays = (Date.now() - new Date(d.gpuDriverDate).getTime()) / 86400000;
    add('Drivers', `Driver de Vídeo (${d.gpuName})`, ageDays > 240 ? 'warn' : 'ok', `Driver de ${new Date(d.gpuDriverDate).toLocaleDateString('pt-BR')} (${Math.round(ageDays)} dias)`, null);
  }

  add('Privacidade', 'Telemetria do Windows', d.telemetry === 0 || d.diagTrack === 'Disabled' ? 'ok' : 'warn',
    d.diagTrack === 'Disabled' ? 'Serviço de telemetria desativado' : 'Coleta de dados ativa', d.diagTrack === 'Disabled' ? null : 'tweaks');
  add('Privacidade', 'Copilot', d.copilot ? 'warn' : 'ok', d.copilot ? 'Instalado' : 'Não instalado', d.copilot ? 'tweaks' : null);
  add('Privacidade', 'Recall', d.recallOff ? 'ok' : 'warn', d.recallOff ? 'Bloqueado por política' : 'Não bloqueado', d.recallOff ? null : 'tweaks');

  add('Segurança', 'Proteção em Tempo Real (Defender)', d.defenderRT === false ? 'warn' : d.defenderRT ? 'ok' : 'warn',
    d.defenderRT === false ? 'Desativada' : d.defenderRT ? `Ativa · assinaturas com ${d.defenderSig} dia(s)` : 'Não foi possível ler (outro antivírus?)', null);
  add('Segurança', 'Ativação do Windows', d.activated === false ? 'warn' : 'ok', d.activated === false ? 'Windows não ativado' : d.activated ? 'Ativado' : 'Não verificado', null);
  if (d.lastRestore) {
    const days = (Date.now() - new Date(d.lastRestore).getTime()) / 86400000;
    add('Segurança', 'Ponto de Restauração', days > 30 ? 'warn' : 'ok', `Último criado há ${Math.round(days)} dia(s)`, days > 30 ? 'restore' : null);
  } else add('Segurança', 'Ponto de Restauração', 'warn', 'Nenhum ponto de restauração encontrado', 'restore');
  add('Sistema', 'Reinício Pendente', d.rebootPending ? 'warn' : 'ok', d.rebootPending ? 'O Windows pede reinício para concluir atualizações' : 'Nenhum', null);

  const weights = { ok: 1, info: 1, warn: 0.5, bad: 0 };
  const score = Math.round((items.reduce((a, i) => a + weights[i.status], 0) / items.length) * 100);
  return { score, items, raw: d };
}

let infoCache = null;

async function getInfo(force = false) {
  if (infoCache && !force) return infoCache;
  infoCache = await psJson(INFO_SCRIPT);
  for (const k of ['memory', 'gpus', 'disks', 'volumes']) if (infoCache[k] && !Array.isArray(infoCache[k])) infoCache[k] = [infoCache[k]];
  return infoCache;
}

async function getXmp() {
  return analyzeXmp(await getInfo());
}

async function checkup() {
  const [data, xmp] = await Promise.all([psJson(CHECKUP_SCRIPT), getXmp().catch(() => null)]);
  if (data.diskHealth && !Array.isArray(data.diskHealth)) data.diskHealth = [data.diskHealth];
  return evaluateCheckup(data, xmp);
}

// Segurança da plataforma (Secure Boot e TPM), para o cartão de informações do sistema
async function getExtra() {
  return psJson(`
$sb = try { [bool](Confirm-SecureBootUEFI -ErrorAction Stop) } catch { $null }
$t = try { Get-Tpm -ErrorAction Stop } catch { $null }
$tv = (Get-CimInstance -Namespace root/cimv2/security/microsofttpm -ClassName Win32_Tpm -ErrorAction SilentlyContinue).SpecVersion
$fw = if ($env:firmware_type) { $env:firmware_type } else { (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control' -ErrorAction SilentlyContinue).PEFirmwareType }
@{ secureBoot = $sb; tpm = [bool]($t -and $t.TpmPresent); tpmReady = [bool]($t -and $t.TpmReady); tpmVersion = "$tv".Split(',')[0].Trim(); firmware = "$fw" } | ConvertTo-Json -Compress`);
}

module.exports = { getInfo, getXmp, checkup, getExtra };
