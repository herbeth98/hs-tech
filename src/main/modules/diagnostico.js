// Diagnóstico de desligamentos, travamentos e erros de hardware a partir dos logs do Windows.
const { psJson, runExe } = require('../ps');

const SCRIPT = (days) => `
$since = (Get-Date).AddDays(-${days})
function Short($m, $n) { $t = ($m -replace '\\s+', ' ').Trim(); if ($t.Length -gt $n) { $t.Substring(0, $n) } else { $t } }
$ev = @()

# Desligamentos inesperados (Kernel-Power 41) com os dados do evento
Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=41; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $x = [xml]$_.ToXml(); $d = @{}; $x.Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'shutdown'; id = 41; bug = [int64]$d.BugcheckCode; button = "$($d.PowerButtonTimestamp)" -ne '0'; sleep = "$($d.SleepInProgress)" -ne '0'; msg = '' }
}
# Hora exata em que o PC caiu (EventLog 6008)
Get-WinEvent -FilterHashtable @{ LogName='System'; Id=6008; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'lost'; id = 6008; msg = Short $_.Message 160 }
}
# Telas azuis (BugCheck 1001)
Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-WER-SystemErrorReporting'; Id=1001; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'bsod'; id = 1001; msg = Short $_.Message 220 }
}
# Erros de hardware (WHEA)
Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-WHEA-Logger'; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $m = $_.Message
  $comp = if ($m -match '(?:componente|Component):\\s*([^\\r\\n]+)') { $Matches[1].Trim() } else { '' }
  $type = if ($m -match '(?:Tipo de Erro|Error Type):\\s*([^\\r\\n]+)') { $Matches[1].Trim() } else { '' }
  $apic = if ($m -match 'APIC[^:]*:\\s*(\\d+)') { $Matches[1] } else { '' }
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'whea'; id = $_.Id; comp = $comp; type = $type; apic = $apic; fatal = ($_.Id -in 18, 20, 46); msg = Short $m 200 }
}
# Driver de vídeo (reinício / travamento recuperado)
Get-WinEvent -FilterHashtable @{ LogName='System'; StartTime=$since } -ErrorAction SilentlyContinue | Where-Object { ($_.ProviderName -match '^(nvlddmkm|amdkmdag|amdwddmg|igfx)' ) -or ($_.ProviderName -eq 'Display' -and $_.Id -eq 4101) } | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'gpu'; id = $_.Id; src = $_.ProviderName; msg = Short $_.Message 160 }
}
# Disco e sistema de arquivos
Get-WinEvent -FilterHashtable @{ LogName='System'; StartTime=$since; Level=1,2,3 } -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match '^(disk|stornvme|storahci|Ntfs|Microsoft-Windows-Ntfs)$' -and $_.Id -in 7, 11, 15, 51, 52, 55, 98, 129, 153 } | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'disk'; id = $_.Id; src = $_.ProviderName; msg = Short $_.Message 160 }
}
# Limitação térmica do processador pelo firmware
Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-Kernel-Processor-Power'; Id=37; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'thermal'; id = 37; msg = Short $_.Message 160 }
}
# Memória RAM esgotada
Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-Resource-Exhaustion-Detector'; Id=2004; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object {
  $ev += [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); kind = 'memory'; id = 2004; msg = Short $_.Message 160 }
}
# Programas que travaram (Application Error 1000)
$apps = @(Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='Application Error'; Id=1000; StartTime=$since } -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Properties[0].Value)" } | Group-Object | Sort-Object Count -Descending | Select-Object -First 8 | ForEach-Object { [pscustomobject]@{ app = $_.Name; count = $_.Count } })

$dumps = @(Get-ChildItem "$env:WINDIR\\Minidump" -Filter *.dmp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ name = $_.Name; t = $_.LastWriteTime.ToString('o'); size = $_.Length } })
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS
$os = Get-CimInstance Win32_OperatingSystem
@{
  events = $ev; apps = $apps; dumps = $dumps
  cpu = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors
  bios = "$($bios.SMBIOSBIOSVersion)"; biosDate = $bios.ReleaseDate.ToString('yyyy-MM-dd')
  boot = $os.LastBootUpTime.ToString('o')
} | ConvertTo-Json -Depth 4 -Compress
`;

// Códigos de tela azul mais comuns
const BUGCHECKS = {
  0x0A: ['IRQL_NOT_LESS_OR_EQUAL', 'driver ou memória RAM instável'],
  0x1A: ['MEMORY_MANAGEMENT', 'memória RAM instável (EXPO/XMP) ou com defeito'],
  0x3B: ['SYSTEM_SERVICE_EXCEPTION', 'driver com problema'],
  0x50: ['PAGE_FAULT_IN_NONPAGED_AREA', 'memória RAM ou driver'],
  0x7E: ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'driver com problema'],
  0x9F: ['DRIVER_POWER_STATE_FAILURE', 'driver ao suspender ou acordar'],
  0xD1: ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'driver de rede, áudio ou vídeo'],
  0xEF: ['CRITICAL_PROCESS_DIED', 'arquivos do sistema ou disco'],
  0x101: ['CLOCK_WATCHDOG_TIMEOUT', 'processador instável (overclock, Curve Optimizer, tensão)'],
  0x116: ['VIDEO_TDR_FAILURE', 'placa de vídeo ou driver de vídeo'],
  0x117: ['VIDEO_TDR_TIMEOUT_DETECTED', 'placa de vídeo ou driver de vídeo'],
  0x124: ['WHEA_UNCORRECTABLE_ERROR', 'erro de hardware: processador, RAM ou tensão'],
  0x133: ['DPC_WATCHDOG_VIOLATION', 'driver travado (armazenamento, rede ou vídeo)'],
  0x139: ['KERNEL_SECURITY_CHECK_FAILURE', 'driver ou memória RAM'],
  0x154: ['UNEXPECTED_STORE_EXCEPTION', 'disco ou SSD'],
  0x1E: ['KMODE_EXCEPTION_NOT_HANDLED', 'driver com problema']
};

function hex(n) { return '0x' + Number(n).toString(16).toUpperCase(); }

function analyze(d, days) {
  const ev = (Array.isArray(d.events) ? d.events : d.events ? [d.events] : []).map((e) => ({ ...e, time: new Date(e.t).getTime() }));
  ev.sort((a, b) => b.time - a.time);
  const by = (k) => ev.filter((e) => e.kind === k);
  const shut = by('shutdown');
  const hard = shut.filter((s) => !s.bug && !s.button && !s.sleep);
  const withBug = shut.filter((s) => s.bug);
  const whea = by('whea');
  const wheaCpu = whea.filter((w) => /processador|processor|cache|machine check/i.test(`${w.comp} ${w.type}`));
  const wheaPcie = whea.filter((w) => /pci/i.test(`${w.comp} ${w.type}`));
  const wheaFatal = whea.filter((w) => w.fatal);
  const gpu = by('gpu');
  const disk = by('disk');
  const thermal = by('thermal');
  const mem = by('memory');
  const dumps = Array.isArray(d.dumps) ? d.dumps : d.dumps ? [d.dumps] : [];
  const apps = Array.isArray(d.apps) ? d.apps : d.apps ? [d.apps] : [];
  const near = (list, t, min) => list.filter((e) => Math.abs(e.time - t) <= min * 60000).length;

  const findings = [];
  const add = (level, title, text, steps, evidence) => findings.push({ level, title, text, steps, evidence });

  if (hard.length) {
    add(hard.length >= 3 ? 'bad' : 'warn', 'Corte Abrupto de Energia',
      `${hard.length} desligamento(s) em ${days} dias sem tela azul, sem arquivo de despejo e sem o botão de energia. O Windows não teve tempo de registrar nada: a energia foi cortada de repente. As causas mais comuns são a fonte (PSU) desarmando por proteção, instabilidade de tensão no processador ou na memória, superaquecimento dos reguladores de tensão (VRM) ou falha na tomada, filtro de linha ou estabilizador.`,
      ['Ligue o PC direto na tomada (sem filtro de linha, estabilizador ou nobreak) por alguns dias para descartar a rede elétrica.',
        'Confira se os cabos de força da placa de vídeo e da CPU (EPS 8 pinos) estão bem encaixados até o fim.',
        'Se fez overclock, Curve Optimizer, PBO ou mudou tensões na BIOS, volte ao padrão e veja se os desligamentos param.',
        'Teste com o EXPO/XMP desligado por alguns dias. Se parar, a memória ou a tensão de SoC está no limite.',
        'Se continuar, a suspeita forte é a fonte: teste com outra fonte de qualidade e potência adequada.'],
      hard.slice(0, 10).map((s) => s.t));
  }
  if (withBug.length) {
    const codes = [...new Set(withBug.map((s) => s.bug))];
    add(withBug.length >= 2 ? 'bad' : 'warn', 'Tela Azul (BSOD)',
      codes.map((c) => { const b = BUGCHECKS[c]; return `${hex(c)}${b ? ` ${b[0]}: ${b[1]}` : ''}`; }).join(' · '),
      ['Atualize a BIOS e os drivers de chipset e de vídeo.', 'Rode o teste de estabilidade (página Overclock Seguro) com a BIOS no padrão.', 'Use a página Reparo para rodar DISM + SFC.'],
      withBug.slice(0, 10).map((s) => `${s.t} ${hex(s.bug)}`));
  }
  if (wheaCpu.length) {
    const cores = [...new Set(wheaCpu.map((w) => w.apic).filter(Boolean))];
    add(wheaFatal.length ? 'bad' : 'warn', 'Erros no Processador (WHEA)',
      `${wheaCpu.length} erro(s) de hardware ${wheaFatal.length ? 'incluindo fatais' : 'corrigidos'} na cache do processador${cores.length ? ` (núcleos APIC ${cores.join(', ')})` : ''}. O processador detectou e corrigiu erros internos. Isso é sinal de que ele está no limite da estabilidade: Curve Optimizer ou PBO agressivos, tensão de SoC/EXPO, BIOS antiga ou, mais raramente, defeito no processador.`,
      [`Atualize a BIOS da placa-mãe (versão atual: ${d.bios}, de ${d.biosDate}).`,
        'Volte Curve Optimizer e PBO ao padrão (Auto) na BIOS.',
        'Teste com o EXPO desligado. Se os erros sumirem, ajuste a tensão de SoC ou use uma velocidade de memória menor.',
        'Rode o teste de estabilidade da CPU por 30 minutos (página Overclock Seguro). Se aparecer erro de cálculo, o processador está instável.'],
      wheaCpu.slice(0, 10).map((w) => `${w.t} APIC ${w.apic || '?'} · ${w.type}`));
  }
  if (wheaPcie.length) {
    add('warn', 'Erros no Barramento PCIe (WHEA)', `${wheaPcie.length} erro(s) no PCIe: costuma ser a placa de vídeo, um SSD NVMe ou o riser.`,
      ['Reencaixe a placa de vídeo e os SSDs.', 'Na BIOS, fixe o PCIe da placa de vídeo em Gen 4 em vez de Auto.', 'Atualize a BIOS.'],
      wheaPcie.slice(0, 10).map((w) => w.t));
  }
  if (gpu.length) {
    const close = hard.filter((s) => near(gpu, s.time, 30)).length;
    add(gpu.length >= 5 ? 'warn' : 'info', 'Travamentos do Driver de Vídeo',
      `${gpu.length} vez(es) o driver de vídeo (${[...new Set(gpu.map((g) => g.src))].join(', ')}) travou e se recuperou${close ? `, ${close} delas até 30 minutos antes de um desligamento` : ''}. Causas comuns: overclock ou undervolt da GPU, driver corrompido, fonte no limite ou temperatura.`,
      ['Tire qualquer overclock ou undervolt da placa de vídeo (MSI Afterburner, NVIDIA App).', 'Reinstale o driver de vídeo do zero com o DDU (página Programas → Hardware).', 'Se acontecer em picos de carga junto com desligamentos, suspeite da fonte.'],
      gpu.slice(0, 10).map((g) => `${g.t} ${g.src} ${g.id}`));
  }
  if (disk.length) {
    add('warn', 'Erros de Disco', `${disk.length} erro(s) de disco ou sistema de arquivos.`,
      ['Confira a saúde dos discos no Check-up.', 'Rode o CHKDSK na página Reparo.', 'Reencaixe os cabos SATA ou o SSD NVMe.'],
      disk.slice(0, 10).map((x) => `${x.t} ${x.src} ${x.id}`));
  }
  if (thermal.length) {
    add('warn', 'Limitação por Temperatura', `${thermal.length} vez(es) o firmware reduziu a velocidade do processador por temperatura ou energia.`,
      ['Limpe a poeira, confira o cooler e a pasta térmica.', 'Veja a curva das ventoinhas na BIOS.'], thermal.slice(0, 10).map((x) => x.t));
  }
  if (mem.length) {
    add('warn', 'Memória RAM Esgotada', `${mem.length} vez(es) o Windows ficou sem memória.`,
      ['Feche programas pesados ou aumente a RAM.', 'Confira o arquivo de paginação.'], mem.slice(0, 10).map((x) => x.t));
  }
  if (!findings.length) add('ok', 'Nenhum Problema Encontrado', `Nenhum desligamento inesperado, tela azul ou erro de hardware nos últimos ${days} dias.`, [], []);

  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => order[a.level] - order[b.level]);

  const timeline = ev.filter((e) => e.kind !== 'lost').slice(0, 80).map((e) => ({
    t: e.t, kind: e.kind,
    text: e.kind === 'shutdown' ? (e.bug ? `Tela azul ${hex(e.bug)}${BUGCHECKS[e.bug] ? ' ' + BUGCHECKS[e.bug][0] : ''}` : e.button ? 'Desligado pelo botão de energia' : 'Desligamento inesperado: corte de energia (registrado ao religar)')
      : e.kind === 'whea' ? `Erro de hardware ${e.fatal ? 'FATAL' : 'corrigido'}: ${e.comp || ''} ${e.type || ''}${e.apic ? ` · APIC ${e.apic}` : ''}`.trim()
      : e.kind === 'gpu' ? `Driver de vídeo travou e se recuperou (${e.src} ${e.id})`
      : e.kind === 'bsod' ? `Tela azul: ${e.msg}`
      : e.kind === 'disk' ? `Erro de disco (${e.src} ${e.id})`
      : e.kind === 'thermal' ? 'Processador limitado por temperatura/energia'
      : e.kind === 'memory' ? 'Memória RAM esgotada'
      : e.msg
  }));

  return {
    days, findings, timeline, apps, dumps,
    counts: { shutdowns: shut.length, hard: hard.length, bsod: withBug.length, whea: whea.length, gpu: gpu.length, disk: disk.length },
    system: { cpu: d.cpu, cores: d.cores, threads: d.threads, bios: d.bios, biosDate: d.biosDate, boot: d.boot },
    lastShutdown: shut[0] ? shut[0].t : null
  };
}

async function run(days = 30) {
  const d = await psJson(SCRIPT(days), { timeout: 180000 });
  return analyze(d || {}, days);
}

async function openReliability() {
  await runExe('perfmon.exe', ['/rel']);
  return true;
}

module.exports = { run, openReliability };
