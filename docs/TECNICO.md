# HS TECH por dentro

Esta página é para quem quer rodar o código, gerar os executáveis ou entender como o app funciona. Para usar o programa, veja o [README](../README.md) ou o [manual](MANUAL.md).

## Rodar pelo código

```bash
npm install
npm start
```

Rode o terminal como administrador: ajustes do Windows, limpeza de pastas do sistema, reparos e a leitura de FPS precisam dessa permissão.

## Gerar o instalador e a versão portátil

```bash
npm run dist
```

Os arquivos saem em `dist/`:

- `HS TECH Setup <versão>.exe`: instalador NSIS, com escolha de pasta e atalhos.
- `HS TECH <versão>.exe`: versão portátil, roda sem instalar.

Os dois pedem administrador (`requireAdministrator`).

## Estrutura

```
src/
  main/                processo principal (Electron)
    main.js            janelas, IPC, bandeja, overlay, atalho global, autoteste
    preload.js         ponte window.hs (call/on, com lista de eventos permitidos)
    ps.js              executor de PowerShell (arquivos .ps1 temporários) e de programas
    bench.js           apoio ao benchmark
    modules/           um módulo por área
      system.js        informações, check-up, XMP, Secure Boot e TPM
      tweaks.js        lista de ajustes, debloat de apps, ajustes NVIDIA
      games.js         topologia da CPU, detecção de jogos, ajustes por jogo, vigia
      gpu.js           nvidia-smi e perfis do driver (NVAPI DRS)
      hwmon.js         sensores do Hardware Monitor
      memory.js        limpeza da memória RAM
      cleaner.js       limpeza de arquivos
      apps.js          programas instalados, inicialização, winget
      drivers.js       erros, atualizações e backup de drivers
      repair.js        Manutenção (SFC, DISM, rede, Windows Update, impressora, áudio)
      network.js       velocidade, ping e perda de pacotes
      monitor.js       monitor de desempenho
      diagnostico.js   leitura dos registros de desligamento e erros
  renderer/            interface
    index.html         tela de abertura, fundo, barra de título, menu lateral
    overlay.html       overlay de FPS
    tokens.css         tokens do design system (cores, raio, espaçamento, movimento)
    styles.css         componentes e animações
    js/app.js          rotas, menu, abertura, pausa das animações fora de foco
    js/bg.js           fundo interativo que segue o mouse
    js/pages/          uma página por arquivo
tools/                 ícone, banner antigo e animação de teste do overlay
docs/vitrine/          ilustrações animadas do README (geradas por gerar.py)
```

## Como as partes conversam

- A interface chama `window.hs.call(nome, ...args)`. O `preload.js` repassa por IPC para o processo principal, que chama o módulo certo.
- Os módulos usam PowerShell para quase tudo. Cada script vira um `.ps1` temporário e roda com `-ExecutionPolicy Bypass`. As saídas em JSON voltam para a interface.
- Partes que o PowerShell não alcança sozinho usam C# carregado com `Add-Type`:
  - perfis do driver NVIDIA pela NVAPI (DRS);
  - topologia da CPU com `GetLogicalProcessorInformationEx` (núcleos físicos, SMT, núcleos de desempenho);
  - limpeza da lista de espera da RAM com `NtSetSystemInformation`.
- Os eventos ao vivo (monitor, overlay, progresso) chegam pela lista de eventos permitidos do `preload.js`.

## Fontes dos dados

| Dado | De onde vem |
|---|---|
| FPS, 1% e 0,1% low, frame time | [PresentMon](https://github.com/GameTechDev/PresentMon) 2.6, baixado pelo próprio app. Sessão ETW `HSTECH_PM`, encerrada com `logman` |
| GPU NVIDIA | `nvidia-smi` em laço (`-lms`) |
| Clock e uso da CPU | contadores `ProcessorInformation` (frequência × % de desempenho) |
| Discos | contadores `PerfDisk` e `StorageReliabilityCounter` (temperatura) |
| Rede | contadores `Tcpip` e testes próprios de ping e perda |
| Desligamentos | registros Kernel-Power 41, 6008, WHEA, nvlddmkm e BugCheck |
| Programas | `winget` |
| Atualizações do Windows | API COM do Windows Update |
| Drivers | `pnputil` |

A temperatura do processador não aparece: o Windows não expõe esse sensor sem um driver de kernel, e o app não instala nenhum.

## Ajustes do sistema

- Plano de energia próprio com GUID fixo `48535445-4348-504c-414e-000000000001`, criado e removido por `powercfg`.
- Prioridade por jogo em `Image File Execution Options\<exe>\PerfOptions\CpuPriorityClass`.
- GPU dedicada por jogo em `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`.
- Tela cheia e compatibilidade em `AppCompatFlags\Layers`.
- Cada ajuste guarda o valor anterior para o botão de desfazer.

## Notas

- Dados do app em `%APPDATA%\HS TECH`.
- As animações decorativas pausam com a janela fora de foco. O app respeita a opção "reduzir movimento" do Windows.
- O empacotado usa `disable-gpu-sandbox`, e o overlay roda com `sandbox: false`; sem isso, a GPU e o overlay falham em alguns PCs.

## Autoteste

O `main.js` tem um modo de autoteste controlado por variáveis de ambiente. Ele abre a janela fora da tela, navega pelas páginas e salva capturas:

```bash
HSTECH_SELFTEST=<pasta> npx electron . --user-data-dir=<pasta-temporária>
```

| Variável | Uso |
|---|---|
| `HSTECH_PAGES` | lista de páginas a capturar |
| `HSTECH_WAIT` | espera antes de cada captura (ms) |
| `HSTECH_H` | altura da janela |
| `HSTECH_DEMO=1` | esconde o nome do usuário e do computador |
| `HSTECH_OVERLAY` | abre o overlay por N ms |
| `HSTECH_BENCH` | roda o benchmark |
| `HSTECH_NOBG` | desliga o fundo animado |
| `HSTECH_VISIBLE` | mostra a janela na tela |

O `--user-data-dir` evita a trava de instância única quando o app já está aberto.

## Ilustrações do README

```bash
python docs/vitrine/gerar.py
```

Gera os SVG animados de `docs/vitrine/`. As animações são só CSS dentro de cada SVG, porque o GitHub bloqueia JavaScript em imagens. Quem pediu "reduzir movimento" vê tudo parado.

## Licenças

- HS TECH: [MIT](../LICENSE).
- [Electron](https://github.com/electron/electron) e [electron-builder](https://github.com/electron-userland/electron-builder): MIT.
- [PresentMon](https://github.com/GameTechDev/PresentMon): MIT, baixado na primeira vez que o FPS é medido.
- [Public Sans](https://github.com/uswds/public-sans): SIL Open Font License 1.1.
