// Ajustes do Windows: desempenho, jogos, privacidade, IA da Microsoft e segurança.
// Cada ajuste tem: check (retorna $true se o ajuste está aplicado), apply e revert.
const { runPS, psJson } = require('../ps');

const K = {
  dataCol: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
  cdm: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager',
  sysPol: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
  gameBar: 'HKCU:\\Software\\Microsoft\\GameBar',
  gfx: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
  mmProfile: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
  winAI: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI',
  winAIu: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsAI',
  copilotM: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot',
  copilotU: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot',
  adv: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
};

const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';
const HS_PLAN = '48535445-4348-504c-414e-000000000001';

// Plano próprio: duplica o Desempenho Máximo (ou Alto Desempenho / Equilibrado) com um GUID fixo e ajusta tudo.
const HS_PLAN_APPLY = `
$hs = '${HS_PLAN}'
if (-not ((powercfg /list) -match $hs)) {
  foreach ($src in '${ULTIMATE}','${HIGH}','${BALANCED}') {
    powercfg -duplicatescheme $src $hs 2>$null | Out-Null
    if ((powercfg /list) -match $hs) { Write-Output "Plano criado a partir de $src"; break }
  }
}
if (-not ((powercfg /list) -match $hs)) { Write-Output 'Não foi possível criar o plano.'; exit 2 }
powercfg /changename $hs 'HS TECH' 'Plano de energia otimizado para jogos e baixa latência (HS TECH)'
$set = @(
  @('SUB_PROCESSOR','PROCTHROTTLEMIN',100), @('SUB_PROCESSOR','PROCTHROTTLEMAX',100),
  @('SUB_PROCESSOR','CPMINCORES',100), @('SUB_PROCESSOR','PERFBOOSTMODE',2), @('SUB_PROCESSOR','PERFEPP',0),
  @('SUB_SLEEP','STANDBYIDLE',0), @('SUB_SLEEP','HIBERNATEIDLE',0), @('SUB_DISK','DISKIDLE',0),
  @('SUB_VIDEO','VIDEOIDLE',900),
  @('2a737441-1930-4402-8d77-b2bebba308a3','48e6b7a6-50f5-4782-a5d4-53bb8f07e226',0),
  @('501a4d13-42af-4429-9fd1-a8218c268e20','ee12f906-d277-404b-b6da-e5fa1a576df5',0),
  @('19cbb8fa-5279-450e-9fac-8a3d5fedd0c1','12bbebe6-58d6-4636-95bb-3217ef867c1a',0)
)
powercfg -attributes SUB_PROCESSOR CPMINCORES -ATTRIB_HIDE 2>$null
powercfg -attributes SUB_PROCESSOR PERFBOOSTMODE -ATTRIB_HIDE 2>$null
foreach ($s in $set) { powercfg /setacvalueindex $hs $s[0] $s[1] $s[2] 2>$null }
powercfg /setactive $hs
Write-Output 'Plano HS TECH ativo.'`;

// Fonte única dos grupos: a interface lê daqui (tweaks:groups e campos groupKey/groupIcon do status).
const GROUPS = [
  { key: 'perf', name: 'Desempenho', label: 'Desempenho', icon: 'bolt' },
  { key: 'games', name: 'Jogos', label: 'Jogos', icon: 'game' },
  { key: 'input', name: 'Input lag', label: 'Input Lag', icon: 'mouse' },
  { key: 'fps', name: 'Estabilidade de FPS', label: 'Estabilidade de FPS', icon: 'activity' },
  { key: 'privacy', name: 'Privacidade', label: 'Privacidade', icon: 'shield' },
  { key: 'ai', name: 'IA da Microsoft', label: 'IA da Microsoft', icon: 'sparkle' },
  { key: 'security', name: 'Segurança', label: 'Segurança', icon: 'shield' }
];
const groupOf = (name) => GROUPS.find((g) => g.name === name) || {};

const TWEAKS = [
  // ---------------- Desempenho ----------------
  {
    id: 'hsplan', group: 'Desempenho', title: 'Plano de Energia HS TECH',
    desc: 'Cria e ativa o plano "HS TECH", baseado no Desempenho Máximo: CPU sempre em 100%, sem estacionamento de núcleos, boost agressivo, USB e PCIe sem economia de energia, disco e PC sem suspender. Em notebook, gasta mais bateria.',
    risk: 'low', recommended: true,
    check: `(powercfg /getactivescheme) -match '${HS_PLAN}'`,
    apply: HS_PLAN_APPLY,
    revert: `powercfg /setactive ${BALANCED}; Write-Output 'Plano Equilibrado ativado. O plano HS TECH continua disponível nas Opções de Energia.'`
  },
  {
    id: 'visualfx', group: 'Desempenho', title: 'Efeitos Visuais para Desempenho',
    desc: 'Desliga animações e sombras do Windows. Mantém a suavização de fontes.', risk: 'low', recommended: false,
    check: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' 'VisualFXSetting') -eq 3`,
    apply: `
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' 'VisualFXSetting' 3
RegSet 'HKCU:\\Control Panel\\Desktop' 'UserPreferencesMask' ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) 'Binary'
RegSet 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' 'MinAnimate' '0' 'String'
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' 'TaskbarAnimations' 0
RegSet 'HKCU:\\Control Panel\\Desktop' 'FontSmoothing' '2' 'String'`,
    revert: `
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' 'VisualFXSetting' 0
RegSet 'HKCU:\\Control Panel\\Desktop' 'UserPreferencesMask' ([byte[]](0x9E,0x1E,0x07,0x80,0x12,0x00,0x00,0x00)) 'Binary'
RegSet 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' 'MinAnimate' '1' 'String'
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' 'TaskbarAnimations' 1`,
    note: 'Vale depois de sair e entrar de novo na conta.'
  },
  {
    id: 'bgapps', group: 'Desempenho', title: 'Bloquear Apps da Store em Segundo Plano',
    desc: 'Impede que apps da Microsoft Store rodem em segundo plano.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy' 'LetAppsRunInBackground') -eq 2`,
    apply: `RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy' 'LetAppsRunInBackground' 2`,
    revert: `RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy' 'LetAppsRunInBackground'`
  },
  {
    id: 'hibernate', group: 'Desempenho', title: 'Desativar Hibernação',
    desc: 'Apaga o hiberfil.sys (libera vários GB no C:) e desliga a Inicialização Rápida, que causa problemas de driver.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' 'HibernateEnabled') -eq 0`,
    apply: `powercfg /hibernate off`,
    revert: `powercfg /hibernate on`
  },
  {
    id: 'widgets', group: 'Desempenho', title: 'Desativar Widgets',
    desc: 'Remove o painel de Widgets (notícias e clima) da barra de tarefas.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh' 'AllowNewsAndInterests') -eq 0`,
    apply: `RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh' 'AllowNewsAndInterests' 0`,
    revert: `RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh' 'AllowNewsAndInterests'`
  },

  // ---------------- Jogos ----------------
  {
    id: 'gamemode', group: 'Jogos', title: 'Modo de Jogo',
    desc: 'O Windows dá prioridade ao jogo aberto e adia atualizações durante a partida.', risk: 'low', recommended: true,
    check: `(RegGet '${K.gameBar}' 'AutoGameModeEnabled') -ne 0`,
    apply: `RegSet '${K.gameBar}' 'AutoGameModeEnabled' 1; RegSet '${K.gameBar}' 'AllowAutoGameMode' 1`,
    revert: `RegSet '${K.gameBar}' 'AutoGameModeEnabled' 0`
  },
  {
    id: 'hags', group: 'Jogos', title: 'Agendamento de GPU Acelerado por Hardware (HAGS)',
    desc: 'A placa de vídeo gerencia a própria memória. Necessário para o DLSS Frame Generation. Pede reinício.', risk: 'low', recommended: true,
    check: `(RegGet '${K.gfx}' 'HwSchMode') -eq 2`,
    apply: `RegSet '${K.gfx}' 'HwSchMode' 2`,
    revert: `RegSet '${K.gfx}' 'HwSchMode' 1`,
    note: 'Reinicie o PC para valer.'
  },
  {
    id: 'gamedvr', group: 'Jogos', title: 'Desativar Gravação em Segundo Plano (Game DVR)',
    desc: 'Desliga a gravação contínua do Xbox Game Bar, que consome GPU e disco durante o jogo.', risk: 'low', recommended: true,
    check: `(RegGet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled') -eq 0`,
    apply: `
RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled' 0
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'AppCaptureEnabled' 0
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' 'AllowGameDVR' 0`,
    revert: `
RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled' 1
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'AppCaptureEnabled' 1
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' 'AllowGameDVR'`
  },
  {
    id: 'gamebar', group: 'Jogos', title: 'Desativar Atalho do Xbox Game Bar',
    desc: 'Impede que o Game Bar abra com Win+G ou pelo botão do controle.', risk: 'low', recommended: false,
    check: `(RegGet '${K.gameBar}' 'UseNexusForGameBarEnabled') -eq 0`,
    apply: `RegSet '${K.gameBar}' 'UseNexusForGameBarEnabled' 0; RegSet '${K.gameBar}' 'ShowStartupPanel' 0`,
    revert: `RegSet '${K.gameBar}' 'UseNexusForGameBarEnabled' 1`
  },
  {
    id: 'mmprofile', group: 'Jogos', title: 'Prioridade Multimídia para Jogos',
    desc: 'Remove o limite de rede para multimídia e reserva menos CPU para tarefas de fundo.', risk: 'low', recommended: true,
    check: `(RegGet '${K.mmProfile}' 'SystemResponsiveness') -eq 10`,
    apply: `
RegSet '${K.mmProfile}' 'NetworkThrottlingIndex' 0xffffffff
RegSet '${K.mmProfile}' 'SystemResponsiveness' 10
RegSet '${K.mmProfile}\\Tasks\\Games' 'GPU Priority' 8
RegSet '${K.mmProfile}\\Tasks\\Games' 'Priority' 6
RegSet '${K.mmProfile}\\Tasks\\Games' 'Scheduling Category' 'High' 'String'
RegSet '${K.mmProfile}\\Tasks\\Games' 'SFIO Priority' 'High' 'String'`,
    revert: `
RegSet '${K.mmProfile}' 'NetworkThrottlingIndex' 10
RegSet '${K.mmProfile}' 'SystemResponsiveness' 20
RegSet '${K.mmProfile}\\Tasks\\Games' 'Priority' 2
RegSet '${K.mmProfile}\\Tasks\\Games' 'Scheduling Category' 'Medium' 'String'
RegSet '${K.mmProfile}\\Tasks\\Games' 'SFIO Priority' 'Normal' 'String'`
  },
  {
    id: 'mouseaccel', group: 'Jogos', title: 'Desativar Aceleração do Mouse',
    desc: 'Desliga "Aumentar precisão do ponteiro". O movimento fica 1:1, melhor para mira.', risk: 'low', recommended: true,
    check: `(RegGet 'HKCU:\\Control Panel\\Mouse' 'MouseSpeed') -eq '0'`,
    apply: `
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseSpeed' '0' 'String'
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold1' '0' 'String'
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold2' '0' 'String'
Add-Type -Namespace W -Name M -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, int[] c, int d);'
[W.M]::SystemParametersInfo(4, 0, [int[]](0,0,0), 3) | Out-Null`,
    revert: `
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseSpeed' '1' 'String'
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold1' '6' 'String'
RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold2' '10' 'String'
Add-Type -Namespace W -Name M -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, int[] c, int d);'
[W.M]::SystemParametersInfo(4, 0, [int[]](6,10,1), 3) | Out-Null`
  },

  // ---------------- Input lag ----------------
  {
    id: 'foreground', group: 'Input lag', title: 'Prioridade para o Programa em Primeiro Plano',
    desc: 'Win32PrioritySeparation = 0x26: fatias de tempo curtas e reforço de CPU para a janela ativa (o jogo). Reduz a latência de entrada.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' 'Win32PrioritySeparation') -eq 38`,
    apply: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' 'Win32PrioritySeparation' 38`,
    revert: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' 'Win32PrioritySeparation' 2`
  },
  {
    id: 'timerres', group: 'Input lag', title: 'Resolução de Timer Global',
    desc: 'Faz o pedido de timer de alta resolução de um jogo valer para o sistema todo (Windows 11). Deixa o frame pacing mais preciso.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' 'GlobalTimerResolutionRequests') -eq 1`,
    apply: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' 'GlobalTimerResolutionRequests' 1`,
    revert: `RegDel 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' 'GlobalTimerResolutionRequests'`,
    note: 'Reinicie o PC para valer.'
  },
  {
    id: 'usbsuspend', group: 'Input lag', title: 'Desativar Suspensão Seletiva USB',
    desc: 'Impede que o Windows coloque mouse, teclado e headset USB em economia de energia, o que causa travadinhas e atraso ao "acordar".', risk: 'low', recommended: true,
    check: `(PcfgAC 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226) -eq 0`,
    apply: `powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0; powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0; powercfg /setactive SCHEME_CURRENT`,
    revert: `powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1; powercfg /setactive SCHEME_CURRENT`
  },
  {
    id: 'nagle', group: 'Input lag', title: 'Desativar Algoritmo de Nagle (Ping em Jogos)',
    desc: 'Envia pacotes TCP na hora, sem agrupar. Ajuda jogos que usam TCP. Não muda nada em jogos que usam só UDP.', risk: 'low', recommended: true,
    check: `$k = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | Where-Object { (Get-ItemProperty $_.PSPath).DhcpIPAddress -or (Get-ItemProperty $_.PSPath).IPAddress } | Select-Object -First 1; (RegGet $k.PSPath 'TcpNoDelay') -eq 1`,
    apply: `Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { RegSet $_.PSPath 'TcpAckFrequency' 1; RegSet $_.PSPath 'TCPNoDelay' 1 }`,
    revert: `Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' | ForEach-Object { RegDel $_.PSPath 'TcpAckFrequency'; RegDel $_.PSPath 'TCPNoDelay' }`
  },
  {
    id: 'keyboard', group: 'Input lag', title: 'Teclado Mais Rápido',
    desc: 'Atraso de repetição mínimo e taxa de repetição máxima.', risk: 'low', recommended: false,
    check: `(RegGet 'HKCU:\\Control Panel\\Keyboard' 'KeyboardDelay') -eq '0'`,
    apply: `RegSet 'HKCU:\\Control Panel\\Keyboard' 'KeyboardDelay' '0' 'String'; RegSet 'HKCU:\\Control Panel\\Keyboard' 'KeyboardSpeed' '31' 'String'`,
    revert: `RegSet 'HKCU:\\Control Panel\\Keyboard' 'KeyboardDelay' '1' 'String'; RegSet 'HKCU:\\Control Panel\\Keyboard' 'KeyboardSpeed' '31' 'String'`,
    note: 'Vale depois de sair e entrar de novo na conta.'
  },
  {
    id: 'stickykeys', group: 'Input lag', title: 'Desativar Atalho das Teclas de Aderência',
    desc: 'Evita a janela de Teclas de Aderência ao apertar Shift 5 vezes no meio do jogo.', risk: 'low', recommended: true,
    check: `(RegGet 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' 'Flags') -eq '506'`,
    apply: `RegSet 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' 'Flags' '506' 'String'; RegSet 'HKCU:\\Control Panel\\Accessibility\\ToggleKeys' 'Flags' '58' 'String'; RegSet 'HKCU:\\Control Panel\\Accessibility\\Keyboard Response' 'Flags' '122' 'String'`,
    revert: `RegSet 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' 'Flags' '510' 'String'; RegSet 'HKCU:\\Control Panel\\Accessibility\\ToggleKeys' 'Flags' '62' 'String'; RegSet 'HKCU:\\Control Panel\\Accessibility\\Keyboard Response' 'Flags' '126' 'String'`
  },

  // ---------------- Estabilidade de FPS ----------------
  {
    id: 'coreparking', group: 'Estabilidade de FPS', title: 'Desativar Estacionamento de Núcleos',
    desc: 'Mantém todos os núcleos do processador acordados e a frequência mínima em 100%. Reduz quedas de FPS e stutter. Aumenta o consumo parado.', risk: 'low', recommended: true,
    check: `(PcfgAC 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583) -eq 100`,
    apply: `
powercfg -attributes 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 -ATTRIB_HIDE
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 100
powercfg /setactive SCHEME_CURRENT`,
    revert: `
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 10
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 5
powercfg /setactive SCHEME_CURRENT`
  },
  {
    id: 'powerthrottle', group: 'Estabilidade de FPS', title: 'Desativar Power Throttling',
    desc: 'Impede que o Windows reduza a CPU de programas em segundo plano (Discord, OBS, overlays), que causam quedas quando são limitados.', risk: 'low', recommended: true,
    check: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' 'PowerThrottlingOff') -eq 1`,
    apply: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' 'PowerThrottlingOff' 1`,
    revert: `RegDel 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' 'PowerThrottlingOff'`
  },
  {
    id: 'dynamictick', group: 'Estabilidade de FPS', title: 'Timer Estável (Desligar Dynamic Tick)',
    desc: 'Desliga o "dynamic tick" e remove o HPET forçado no boot. Deixa o tempo entre frames mais regular. Pede reinício.', risk: 'medium', recommended: false,
    check: `((bcdedit /enum '{current}') -join ' ') -match 'disabledynamictick\\s+(Yes|Sim)'`,
    apply: `bcdedit /set disabledynamictick yes; bcdedit /deletevalue useplatformclock 2>$null; Write-Output 'Aplicado. Reinicie o PC.'`,
    revert: `bcdedit /deletevalue disabledynamictick`,
    note: 'Reinicie o PC para valer.'
  },
  {
    id: 'fso', group: 'Estabilidade de FPS', title: 'Desativar Otimizações de Tela Cheia (Global)',
    desc: 'Usa a tela cheia exclusiva de verdade em jogos DirectX 9/11 antigos. Em alguns jogos reduz input lag; em outros (DX12) não muda nada.', risk: 'low', recommended: false,
    check: `(RegGet 'HKCU:\\System\\GameConfigStore' 'GameDVR_FSEBehaviorMode') -eq 2`,
    apply: `RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_FSEBehaviorMode' 2; RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 1; RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1`,
    revert: `RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_FSEBehaviorMode' 0; RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 0; RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 0`
  },
  {
    id: 'sysmain', group: 'Estabilidade de FPS', title: 'Desativar SysMain (Superfetch)',
    desc: 'Para o pré-carregamento de programas na RAM. Em PCs com SSD reduz uso de disco em segundo plano; em HD pode deixar a abertura de apps mais lenta.', risk: 'low', recommended: false,
    check: `"$((Get-Service SysMain -ErrorAction SilentlyContinue).StartType)" -eq 'Disabled'`,
    apply: `Stop-Service SysMain -Force -ErrorAction SilentlyContinue; Set-Service SysMain -StartupType Disabled`,
    revert: `Set-Service SysMain -StartupType Automatic; Start-Service SysMain -ErrorAction SilentlyContinue`
  },
  {
    id: 'vbs', group: 'Estabilidade de FPS', title: 'Desativar Integridade de Memória (VBS/HVCI)',
    desc: 'Desliga o isolamento de núcleo. Pode dar de 5% a 15% a mais de FPS em alguns jogos, mas reduz a proteção contra drivers maliciosos. Alguns anticheats (Valorant/Vanguard, FACEIT) exigem que fique ligado.',
    risk: 'high', recommended: false,
    check: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' 'Enabled') -eq 0`,
    apply: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' 'Enabled' 0; RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' 'EnableVirtualizationBasedSecurity' 0`,
    revert: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' 'Enabled' 1; RegDel 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' 'EnableVirtualizationBasedSecurity'`,
    note: 'Reinicie o PC para valer.'
  },

  // ---------------- Privacidade ----------------
  {
    id: 'telemetry', group: 'Privacidade', title: 'Desativar Telemetria',
    desc: 'Coloca a coleta de dados no mínimo e desliga os serviços DiagTrack e dmwappushservice.', risk: 'low', recommended: true,
    check: `((RegGet '${K.dataCol}' 'AllowTelemetry') -eq 0) -and ("$((Get-Service DiagTrack -ErrorAction SilentlyContinue).StartType)" -eq 'Disabled')`,
    apply: `
RegSet '${K.dataCol}' 'AllowTelemetry' 0
RegSet '${K.dataCol}' 'DoNotShowFeedbackNotifications' 1
RegSet 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection' 'AllowTelemetry' 0
foreach ($s in 'DiagTrack','dmwappushservice') { Stop-Service $s -Force -ErrorAction SilentlyContinue; Set-Service $s -StartupType Disabled -ErrorAction SilentlyContinue }
foreach ($t in '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator','\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip','\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient') {
  $n = Split-Path $t -Leaf; $p = (Split-Path $t -Parent) + '\\'
  Disable-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue | Out-Null
}`,
    revert: `
RegDel '${K.dataCol}' 'AllowTelemetry'
RegDel 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection' 'AllowTelemetry'
Set-Service DiagTrack -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service DiagTrack -ErrorAction SilentlyContinue
Set-Service dmwappushservice -StartupType Manual -ErrorAction SilentlyContinue`
  },
  {
    id: 'adid', group: 'Privacidade', title: 'Desativar ID de Publicidade e Experiências Personalizadas',
    desc: 'Impede anúncios personalizados e o uso dos dados de diagnóstico para sugestões.', risk: 'low', recommended: true,
    check: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' 'Enabled') -eq 0`,
    apply: `
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' 'Enabled' 0
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AdvertisingInfo' 'DisabledByGroupPolicy' 1
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' 0
RegSet 'HKCU:\\Software\\Microsoft\\Siuf\\Rules' 'NumberOfSIUFInPeriod' 0`,
    revert: `
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' 'Enabled' 1
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AdvertisingInfo' 'DisabledByGroupPolicy'
RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' 1
RegDel 'HKCU:\\Software\\Microsoft\\Siuf\\Rules' 'NumberOfSIUFInPeriod'`
  },
  {
    id: 'activity', group: 'Privacidade', title: 'Desativar Histórico de Atividades',
    desc: 'O Windows deixa de registrar e enviar o histórico de apps e arquivos abertos.', risk: 'low', recommended: true,
    check: `(RegGet '${K.sysPol}' 'PublishUserActivities') -eq 0`,
    apply: `RegSet '${K.sysPol}' 'EnableActivityFeed' 0; RegSet '${K.sysPol}' 'PublishUserActivities' 0; RegSet '${K.sysPol}' 'UploadUserActivities' 0`,
    revert: `RegDel '${K.sysPol}' 'EnableActivityFeed'; RegDel '${K.sysPol}' 'PublishUserActivities'; RegDel '${K.sysPol}' 'UploadUserActivities'`
  },
  {
    id: 'suggestions', group: 'Privacidade', title: 'Remover Anúncios e Sugestões do Windows',
    desc: 'Desliga sugestões no Iniciar, dicas, apps instalados sem pedir e propaganda na tela de bloqueio.', risk: 'low', recommended: true,
    check: `(RegGet '${K.cdm}' 'SilentInstalledAppsEnabled') -eq 0`,
    apply: `
foreach ($n in 'SilentInstalledAppsEnabled','SystemPaneSuggestionsEnabled','SoftLandingEnabled','SubscribedContent-338388Enabled','SubscribedContent-338389Enabled','SubscribedContent-338393Enabled','SubscribedContent-353694Enabled','SubscribedContent-353696Enabled','SubscribedContent-310093Enabled','RotatingLockScreenOverlayEnabled','PreInstalledAppsEnabled','OemPreInstalledAppsEnabled','ContentDeliveryAllowed') { RegSet '${K.cdm}' $n 0 }
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent' 'DisableWindowsConsumerFeatures' 1
RegSet '${K.adv}' 'Start_IrisRecommendations' 0`,
    revert: `
foreach ($n in 'SilentInstalledAppsEnabled','SystemPaneSuggestionsEnabled','SoftLandingEnabled','SubscribedContent-338388Enabled','SubscribedContent-338389Enabled','SubscribedContent-338393Enabled','SubscribedContent-353694Enabled','SubscribedContent-353696Enabled','SubscribedContent-310093Enabled','RotatingLockScreenOverlayEnabled','ContentDeliveryAllowed') { RegSet '${K.cdm}' $n 1 }
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent' 'DisableWindowsConsumerFeatures'
RegSet '${K.adv}' 'Start_IrisRecommendations' 1`
  },
  {
    id: 'bingsearch', group: 'Privacidade', title: 'Tirar a Busca do Bing do Menu Iniciar',
    desc: 'A pesquisa do Iniciar busca só no PC, sem mandar o que você digita para a web.', risk: 'low', recommended: true,
    check: `(RegGet 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions') -eq 1`,
    apply: `RegSet 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions' 1; RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search' 'BingSearchEnabled' 0`,
    revert: `RegDel 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions'; RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search' 'BingSearchEnabled' 1`,
    note: 'Vale depois de reiniciar o Explorer ou o PC.'
  },
  {
    id: 'location', group: 'Privacidade', title: 'Desativar Localização',
    desc: 'Bloqueia o acesso de apps à localização do PC.', risk: 'low', recommended: false,
    check: `(RegGet 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' 'Value') -eq 'Deny'`,
    apply: `RegSet 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' 'Value' 'Deny' 'String'`,
    revert: `RegSet 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' 'Value' 'Allow' 'String'`
  },
  {
    id: 'wer', group: 'Privacidade', title: 'Desativar Relatório de Erros do Windows',
    desc: 'O Windows deixa de juntar e enviar relatórios de travamento para a Microsoft.', risk: 'low', recommended: false,
    check: `(RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting' 'Disabled') -eq 1`,
    apply: `RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting' 'Disabled' 1; Set-Service WerSvc -StartupType Disabled -ErrorAction SilentlyContinue`,
    revert: `RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting' 'Disabled'; Set-Service WerSvc -StartupType Manual -ErrorAction SilentlyContinue`
  },

  // ---------------- IA da Microsoft ----------------
  {
    id: 'copilot', group: 'IA da Microsoft', title: 'Remover e Bloquear o Copilot',
    desc: 'Desinstala o app Copilot, tira o botão da barra de tarefas e bloqueia por política.', risk: 'low', recommended: true,
    check: `((RegGet '${K.copilotU}' 'TurnOffWindowsCopilot') -eq 1) -and !(Get-AppxPackage -Name '*Copilot*' -ErrorAction SilentlyContinue)`,
    apply: `
RegSet '${K.copilotU}' 'TurnOffWindowsCopilot' 1
RegSet '${K.copilotM}' 'TurnOffWindowsCopilot' 1
RegSet '${K.adv}' 'ShowCopilotButton' 0
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' 'HubsSidebarEnabled' 0
Get-AppxPackage -AllUsers -Name '*Copilot*' -ErrorAction SilentlyContinue | ForEach-Object { Write-Output "Removendo $($_.Name)"; Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction SilentlyContinue }
Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like '*Copilot*' | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }`,
    revert: `
RegDel '${K.copilotU}' 'TurnOffWindowsCopilot'
RegDel '${K.copilotM}' 'TurnOffWindowsCopilot'
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' 'HubsSidebarEnabled'
Write-Output 'Bloqueio removido. Para reinstalar o Copilot, baixe pela Microsoft Store.'`
  },
  {
    id: 'recall', group: 'IA da Microsoft', title: 'Desativar e Bloquear o Recall',
    desc: 'Remove o recurso Recall (capturas de tela da sua atividade) e bloqueia por política.', risk: 'low', recommended: true,
    check: `(RegGet '${K.winAI}' 'DisableAIDataAnalysis') -eq 1`,
    apply: `
RegSet '${K.winAI}' 'DisableAIDataAnalysis' 1
RegSet '${K.winAI}' 'AllowRecallEnablement' 0
RegSet '${K.winAIu}' 'DisableAIDataAnalysis' 1
$f = Get-WindowsOptionalFeature -Online -FeatureName Recall -ErrorAction SilentlyContinue
if ($f -and $f.State -eq 'Enabled') { Disable-WindowsOptionalFeature -Online -FeatureName Recall -NoRestart -ErrorAction SilentlyContinue | Out-Null; Write-Output 'Recurso Recall removido.' } else { Write-Output 'Recall não está instalado neste PC; bloqueio aplicado.' }`,
    revert: `RegDel '${K.winAI}' 'DisableAIDataAnalysis'; RegDel '${K.winAI}' 'AllowRecallEnablement'; RegDel '${K.winAIu}' 'DisableAIDataAnalysis'`
  },
  {
    id: 'aiapps', group: 'IA da Microsoft', title: 'Desativar IA no Paint, Bloco de Notas e Click to Do',
    desc: 'Bloqueia Cocreator, preenchimento generativo, reescrita do Bloco de Notas e o Click to Do.', risk: 'low', recommended: false,
    check: `(RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableCocreator') -eq 1`,
    apply: `
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableCocreator' 1
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableGenerativeFill' 1
RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableImageCreator' 1
RegSet 'HKLM:\\SOFTWARE\\Policies\\WindowsNotepad' 'DisableAIFeatures' 1
RegSet '${K.winAI}' 'DisableClickToDo' 1`,
    revert: `
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableCocreator'
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableGenerativeFill'
RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Paint' 'DisableImageCreator'
RegDel 'HKLM:\\SOFTWARE\\Policies\\WindowsNotepad' 'DisableAIFeatures'
RegDel '${K.winAI}' 'DisableClickToDo'`
  },

  // ---------------- Segurança ----------------
  {
    id: 'defender', group: 'Segurança', title: 'Desativar Proteção em Tempo Real do Defender',
    desc: 'Desliga a verificação em tempo real do Microsoft Defender. Use só por pouco tempo (por exemplo, para instalar algo que você confia). O PC fica desprotegido.',
    risk: 'high', recommended: false,
    check: `(Get-MpPreference).DisableRealtimeMonitoring -eq $true`,
    apply: `
$st = Get-MpComputerStatus
if ($st.IsTamperProtected) { Write-Output 'TAMPER: A Proteção contra Adulteração está ligada. Abra Segurança do Windows > Proteção contra vírus e ameaças > Gerenciar configurações e desligue "Proteção contra adulteração". Depois tente de novo.'; exit 3 }
Set-MpPreference -DisableRealtimeMonitoring $true
Start-Sleep -Milliseconds 800
if ((Get-MpPreference).DisableRealtimeMonitoring) { Write-Output 'Proteção em tempo real desativada.' } else { Write-Output 'O Windows não aceitou a mudança.'; exit 4 }`,
    revert: `Set-MpPreference -DisableRealtimeMonitoring $false; Write-Output 'Proteção em tempo real reativada.'`,
    note: 'O Windows reativa a proteção sozinho depois de um tempo ou ao reiniciar.'
  }
];

async function status() {
  const parts = TWEAKS.map((t) => `try { $r['${t.id}'] = [bool](& { ${t.check} }) } catch { $r['${t.id}'] = $null }`);
  const script = `$r = @{}\n${parts.join('\n')}\n$r | ConvertTo-Json -Compress`;
  const states = await psJson(script);
  return TWEAKS.map(({ id, group, title, desc, risk, recommended, note }) => ({ id, group, groupKey: groupOf(group).key, groupIcon: groupOf(group).icon, title, desc, risk, recommended, note, active: states ? states[id] : null }));
}

async function set(id, enable, log = () => {}) {
  const t = TWEAKS.find((x) => x.id === id);
  if (!t) throw new Error('Ajuste desconhecido: ' + id);
  const r = await runPS(enable ? t.apply : t.revert, { onLine: log });
  if (r.code !== 0) throw new Error((r.stdout + r.stderr).trim().split('\n').pop() || `Falhou (código ${r.code})`);
  const now = await psJson(`$o = try { [bool](& { ${t.check} }) } catch { $null }; @{ v = $o } | ConvertTo-Json -Compress`);
  return { id, active: now ? now.v : null, output: r.stdout.trim() };
}

// ---------------- NVIDIA ----------------
async function nvidiaStatus() {
  return psJson(`
$app = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^NVIDIA (app|GeForce Experience)' } | Select-Object -First 1
$procs = @(Get-Process -Name 'NVIDIA Overlay','NVIDIA Share','nvsphelper64' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique)
$exe = @('C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\CEF\\NVIDIA app.exe','C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
@{ installed = [bool]$app; appName = $app.DisplayName; version = $app.DisplayVersion; running = $procs; appExe = $exe; gpu = [bool](Get-CimInstance Win32_VideoController | Where-Object Name -match 'NVIDIA') } | ConvertTo-Json -Compress`);
}

async function nvidiaCloseOverlay() {
  const r = await runPS(`Get-Process -Name 'NVIDIA Overlay','NVIDIA Share' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Output 'ok'`);
  return r.code === 0;
}

// ---------------- Debloat (apps da Store) ----------------
const PROTECTED = /^(Microsoft\.(WindowsStore|StorePurchaseApp|DesktopAppInstaller|VCLibs.*|NET\..*|UI\.Xaml.*|SecHealthUI|WindowsAppRuntime.*|Services\.Store\.Engagement|Windows\.ShellExperienceHost|Windows\.StartMenuExperienceHost|AAD\.BrokerPlugin|AccountsControl|LockApp|Win32WebViewHost|WebpImageExtension|HEIFImageExtension|VP9VideoExtensions|WebMediaExtensions|HEVCVideoExtension|AV1VideoExtension|RawImageExtension|ApplicationCompatibilityEnhancements|Windows\.CloudExperienceHost|Windows\.Search|Windows\.PeopleExperienceHost|WindowsTerminal|Windows\.Photos|WindowsNotepad|Paint|ScreenSketch|WindowsCalculator|Edge.*|MicrosoftEdge.*|XboxIdentityProvider|XboxGameCallableUI|Windows\.XGpuEjectDialog|Windows\.Apprep\.ChxApp|Windows\.SecureAssessmentBrowser|Windows\.OOBENetwork.*|Windows\.ParentalControls|Windows\.CapturePicker|Windows\.PinningConfirmationDialog|Windows\.AssignedAccessLockApp|Windows\.NarratorQuickStart|Windows\.ContentDeliveryManager|Windows\.PrintQueueActionCenter|Windows\.CallingShellApp|BioEnrollment|CredDialogHost|ECApp|LanguageExperiencePack.*|Windows\.Ai\.Copilot\.Provider)|windows\.immersivecontrolpanel|MicrosoftWindows\.Client\..*|MicrosoftWindows\.CrossDevice|NcsiUwpApp|Windows\.PrintDialog|1527c705-839a-4832-9118-54d4Bd6a0c89|c5e2524a-ea46-4f67-841f-6a9465d9d515|E2A4F912-2574-4A75-9BB0-0D023378592B|F46D4000-FD22-4DB4-AC8E-4E1DDDE828FE)/i;

// Codecs, idiomas, drivers de fabricantes (painel NVIDIA, áudio Realtek/Dolby/DTS) e runtimes: nunca listar.
const PROTECTED_EXTRA = /(VideoExtension|ImageExtension|AudioExtension|Microsoft\.Ink\.|Speech\.|LanguageExperiencePack|Microsoft\.Winget\.|Microsoft\.DesktopAppInstaller|^NVIDIACorp\.|^RealtekSemiconductorCorp\.|^AppUp\.Intel|^AdvancedMicroDevicesInc|^DolbyLaboratories\.|^DTSInc\.|^PythonSoftwareFoundation\.|^Microsoft\.HEVC|^Microsoft\.RawImage|^Microsoft\.Windows\.DevHome\.Azure|^ELANMicroelectronics|^SynapticsIncorporated|^WavesAudio|^AD2F1837\.|^B9ECED6F\.|^ASUSTeK|^MSI\.|^GigabyteTechnology)/i;

const RECOMMENDED = {
  'Microsoft.BingNews': 'Notícias', 'Microsoft.BingWeather': 'Clima', 'Microsoft.BingSearch': 'Pesquisa Bing',
  'Microsoft.GetHelp': 'Obter Ajuda', 'Microsoft.Getstarted': 'Dicas', 'Microsoft.MicrosoftOfficeHub': 'Microsoft 365 (Office Hub)',
  'Microsoft.MicrosoftSolitaireCollection': 'Paciência', 'Microsoft.People': 'Pessoas', 'Microsoft.PowerAutomateDesktop': 'Power Automate',
  'Microsoft.Todos': 'To Do', 'Microsoft.WindowsFeedbackHub': 'Hub de Comentários', 'Microsoft.WindowsMaps': 'Mapas',
  'Microsoft.ZuneVideo': 'Filmes e TV', 'Clipchamp.Clipchamp': 'Clipchamp', 'Microsoft.549981C3F5F10': 'Cortana',
  'MicrosoftTeams': 'Teams (pessoal)', 'MSTeams': 'Teams', 'Microsoft.OutlookForWindows': 'Outlook (novo)',
  'Microsoft.Copilot': 'Copilot', 'Microsoft.Windows.DevHome': 'Dev Home', 'Microsoft.MixedReality.Portal': 'Realidade Misturada',
  'Microsoft.SkypeApp': 'Skype', 'Microsoft.Wallet': 'Carteira', 'MicrosoftCorporationII.MicrosoftFamily': 'Família',
  'Microsoft.WindowsSoundRecorder': 'Gravador de Som', 'Microsoft.MicrosoftJournal': 'Journal', 'Microsoft.Office.OneNote': 'OneNote',
  'Microsoft.Microsoft3DViewer': 'Visualizador 3D', 'Microsoft.MSPaint': 'Paint 3D', 'Microsoft.Print3D': 'Print 3D',
  'Microsoft.News': 'Notícias', 'Microsoft.Windows.Ai.Copilot.Provider': 'Copilot (provedor)', 'Microsoft.Edge.GameAssist': 'Game Assist',
  'SpotifyAB.SpotifyMusic': 'Spotify (pré-instalado)', 'Disney.37853FC22B2CE': 'Disney+', 'BytedancePte.Ltd.TikTok': 'TikTok',
  'Facebook.Facebook': 'Facebook', 'Facebook.Instagram': 'Instagram', 'AmazonVideo.PrimeVideo': 'Prime Video',
  '5A894077.McAfeeSecurity': 'McAfee', 'king.com.CandyCrushSaga': 'Candy Crush', 'king.com.CandyCrushSodaSaga': 'Candy Crush Soda',
  '7EE7776C.LinkedInforWindows': 'LinkedIn'
};
const KEEP_HINT = {
  'Microsoft.GamingApp': 'Xbox: necessário para Game Pass', 'Microsoft.XboxGamingOverlay': 'Xbox Game Bar',
  'Microsoft.Xbox.TCUI': 'Usado por jogos da Microsoft', 'Microsoft.XboxSpeechToTextOverlay': 'Xbox',
  'Microsoft.YourPhone': 'Vincular ao Celular', 'Microsoft.ZuneMusic': 'Media Player', 'Microsoft.WindowsCamera': 'Câmera',
  'Microsoft.WindowsAlarms': 'Relógio', 'Microsoft.MicrosoftStickyNotes': 'Notas Autoadesivas', 'MicrosoftCorporationII.QuickAssist': 'Assistência Rápida',
  'Microsoft.OneDriveSync': 'OneDrive', 'Microsoft.WindowsSoundRecorder': 'Gravador de Som'
};

async function appxList() {
  const list = await psJson(`
@(Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' } | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; full = $_.PackageFullName; version = "$($_.Version)"; publisher = $_.Publisher; nonRemovable = [bool]$_.NonRemovable }
}) | ConvertTo-Json -Compress`);
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const seen = new Set();
  return arr
    .filter((p) => !p.nonRemovable && !PROTECTED.test(p.name) && !PROTECTED_EXTRA.test(p.name) && !seen.has(p.name) && seen.add(p.name))
    .map((p) => ({
      name: p.name, version: p.version,
      label: RECOMMENDED[p.name] || KEEP_HINT[p.name] || p.name.replace(/^[^.]+\./, ''),
      recommended: !!RECOMMENDED[p.name] && !KEEP_HINT[p.name],
      hint: KEEP_HINT[p.name] || null,
      thirdParty: !/CN=Microsoft/i.test(p.publisher)
    }))
    .sort((a, b) => (b.recommended - a.recommended) || a.label.localeCompare(b.label));
}

async function appxRemove(names, log = () => {}) {
  const results = [];
  for (const n of names) {
    if (PROTECTED.test(n)) { log(`Ignorado (protegido): ${n}`); continue; }
    log(`Removendo ${n}...`);
    const safe = n.replace(/'/g, "''");
    const r = await runPS(`
$ok = $true
Get-AppxPackage -AllUsers -Name '${safe}' | ForEach-Object { try { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction Stop } catch { try { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop } catch { $ok = $false; Write-Output $_.Exception.Message } } }
Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq '${safe}' | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }
if ($ok) { Write-Output 'OK' }`);
    const ok = /OK\s*$/.test(r.stdout.trim());
    log(ok ? `  ✓ ${n} removido` : `  ✗ ${n}: ${r.stdout.trim().split('\n')[0]}`);
    results.push({ name: n, ok });
  }
  return results;
}

module.exports = { status, set, TWEAKS, GROUPS, nvidiaStatus, nvidiaCloseOverlay, appxList, appxRemove };
