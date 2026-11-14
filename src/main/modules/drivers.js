// Verificação de drivers: lista, dispositivos com erro, atualizações pelo Windows Update e backup.
const { psJson, runPS, runExe } = require('../ps');

async function list() {
  const r = await psJson(`
$classes = 'DISPLAY','NET','MEDIA','SYSTEM','HDC','SCSIADAPTER','USB','BLUETOOTH','HIDCLASS','PRINTER','CAMERA','IMAGE','BIOMETRIC','SOFTWARECOMPONENT','EXTENSION'
$drv = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -and $_.DriverVersion -and ($classes -contains "$($_.DeviceClass)") } | ForEach-Object {
  [pscustomobject]@{ name = $_.DeviceName; cls = "$($_.DeviceClass)"; version = $_.DriverVersion; date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }; maker = $_.Manufacturer; provider = $_.DriverProviderName; inf = $_.InfName; signed = [bool]$_.IsSigned; id = $_.DeviceID }
})
$bad = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 -and -not ($_.ConfigManagerErrorCode -eq 24 -and $_.DeviceID -match '^ACPI\\\\PNP0(303|F03|F13)') } | ForEach-Object {
  [pscustomobject]@{ name = if ($_.Name) { $_.Name } else { $_.DeviceID }; code = $_.ConfigManagerErrorCode; cls = $_.PNPClass; id = $_.DeviceID }
})
@{ drivers = $drv; problems = $bad } | ConvertTo-Json -Depth 4 -Compress`);
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const drivers = arr(r.drivers).filter((d) => !/^(Microsoft|\(Standard|\(Padr|Generic|Gen[eé]rico)/i.test(d.provider || '') || ['DISPLAY', 'NET', 'MEDIA'].includes(d.cls));
  const seen = new Set();
  const uniq = drivers.filter((d) => { const k = d.name + d.version; if (seen.has(k)) return false; seen.add(k); return true; });
  const now = Date.now();
  for (const d of uniq) {
    d.ageDays = d.date ? Math.round((now - new Date(d.date).getTime()) / 86400000) : null;
    d.old = d.ageDays != null && d.ageDays > 730 && !/^(Microsoft)/i.test(d.provider || '');
  }
  const CODES = { 1: 'Dispositivo mal configurado', 3: 'Driver corrompido', 10: 'Dispositivo não consegue iniciar', 12: 'Sem recursos livres', 14: 'Precisa reiniciar', 18: 'Reinstale o driver', 19: 'Registro corrompido', 24: 'Dispositivo ausente ou com defeito', 28: 'Driver não instalado', 31: 'Driver não carregou', 39: 'Driver corrompido ou ausente', 43: 'O Windows parou o dispositivo (erro 43)', 48: 'Driver bloqueado por incompatibilidade', 52: 'Assinatura do driver inválida' };
  const problems = arr(r.problems).map((p) => ({ ...p, reason: CODES[p.code] || `Código de erro ${p.code}` }));
  uniq.sort((a, b) => a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name));
  return { drivers: uniq, problems };
}

const WU_SEARCH = `
$s = New-Object -ComObject Microsoft.Update.Session
$q = $s.CreateUpdateSearcher()
$res = $q.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
`;

async function searchUpdates() {
  const r = await psJson(`${WU_SEARCH}
@($res.Updates | ForEach-Object { [pscustomobject]@{ id = $_.Identity.UpdateID; title = $_.Title; maker = $_.DriverManufacturer; model = $_.DriverModel; cls = $_.DriverClass; date = if ($_.DriverVerDate) { ([datetime]$_.DriverVerDate).ToString('yyyy-MM-dd') } else { $null }; size = [int64]$_.MaxDownloadSize } }) | ConvertTo-Json -Compress`, { timeout: 300000 });
  return Array.isArray(r) ? r : r ? [r] : [];
}

async function installUpdates(ids, log = () => {}) {
  const list = ids.map((i) => `'${String(i).replace(/'/g, '')}'`).join(',');
  log('Procurando os drivers selecionados no Windows Update...');
  const r = await runPS(`${WU_SEARCH}
$want = @(${list})
$coll = New-Object -ComObject Microsoft.Update.UpdateColl
foreach ($u in $res.Updates) { if ($want -contains $u.Identity.UpdateID) { if (-not $u.EulaAccepted) { $u.AcceptEula() }; [void]$coll.Add($u); Write-Output "Selecionado: $($u.Title)" } }
if ($coll.Count -eq 0) { Write-Output 'Nenhum driver encontrado.'; exit 0 }
Write-Output 'Baixando...'
$d = $s.CreateUpdateDownloader(); $d.Updates = $coll; [void]$d.Download()
Write-Output 'Instalando...'
$i = $s.CreateUpdateInstaller(); $i.Updates = $coll; $x = $i.Install()
for ($k = 0; $k -lt $coll.Count; $k++) { $rc = $x.GetUpdateResult($k).ResultCode; Write-Output ("{0}: {1}" -f $coll.Item($k).Title, @('Não iniciado','Em andamento','Instalado','Instalado com erros','Falhou','Cancelado')[$rc]) }
if ($x.RebootRequired) { Write-Output 'REINICIO: reinicie o PC para concluir.' }`, { onLine: log, timeout: 1800000 });
  return r.code === 0;
}

async function backup(dest, log = () => {}) {
  log(`Exportando drivers de terceiros para ${dest}...`);
  const r = await runExe('pnputil', ['/export-driver', '*', dest], { onLine: log });
  return r.code === 0;
}

async function rescan() {
  await runExe('pnputil', ['/scan-devices']);
  return true;
}

module.exports = { list, searchUpdates, installUpdates, backup, rescan };
