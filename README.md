# HS TECH

Otimizador, monitor e kit de ferramentas para PCs Windows 10/11, feito em Electron. Interface em português, tema escuro no design system Nuxt (navy + verde), sem dependências além do Electron.

## Download

Baixe a versão pronta na [página de Releases](https://github.com/herbeth98/hs-tech/releases/latest):

| Arquivo | Para quem |
|---|---|
| [**HS-TECH-Setup-1.0.0.exe**](https://github.com/herbeth98/hs-tech/releases/download/v1.0.0/HS-TECH-Setup-1.0.0.exe) | Instalador: escolhe a pasta e cria atalhos na Área de Trabalho e no Menu Iniciar |
| [**HS-TECH-Portatil-1.0.0.exe**](https://github.com/herbeth98/hs-tech/releases/download/v1.0.0/HS-TECH-Portatil-1.0.0.exe) | Versão portátil: roda direto, sem instalar |

Requer Windows 10 ou 11 (64 bits). Os executáveis não têm assinatura digital: se o SmartScreen avisar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

## Como rodar pelo código

```bash
npm install
npm start
```

Rode o terminal como administrador. Sem admin, o app mostra um aviso na barra de título e oferece reabrir como administrador.

## Como gerar o instalador

```bash
npm run dist
```

Gera em `dist/` o instalador (NSIS) e a versão portátil. O `.exe` já pede permissão de administrador ao abrir.

## Funções

| Página | O que faz |
|---|---|
| Painel | Acelerador de otimização (0–100) com Boost, monitor em tempo real (CPU/GPU/RAM/disco/rede, 60 s), pontos de restauração, limpeza de arquivos e da memória RAM, ações recomendadas e informações do sistema (com Secure Boot e TPM) |
| Hardware Monitor | Árvore de sensores (CPU por núcleo, GPU NVIDIA, RAM, discos com temperatura, rede) com valor, mínimo e máximo, e gravação em CSV |
| Check-up | ~20 verificações com nota de 0 a 100 e botão para resolver cada item |
| Benchmark | CPU (1 núcleo e todos), RAM, GPU (WebGL2 1080p) e disco; pontuação (1000 = PC gamer intermediário), níveis e histórico |
| Otimização | Ajustes com estado atual e desfazer: Desempenho (plano de energia HS TECH), Jogos, Input Lag, Estabilidade de FPS, Privacidade, IA da Microsoft (Copilot, Recall), Segurança (Defender) |
| Limpeza | Temporários, Windows Update, despejos, miniaturas, shaders, navegadores, logs, Lixeira |
| Jogos | Detecta jogos (Steam, Epic, GOG, Ubisoft, EA, Riot, Battle.net, Xbox); por jogo: afinidade (sem núcleo 0, sem SMT, só P-cores), prioridade, GPU dedicada, tela cheia, pasta do executável, atalho otimizado |
| Placa de Vídeo | nvidia-smi (clock, temperatura, potência, link PCIe), perfil do driver NVIDIA via NVAPI, limites de potência e de clock |
| Overclock Seguro | Diagnóstico por CPU, XMP/EXPO, GPU e teste de estabilidade com verificação de erros |
| Programas | Instalar (winget, kits prontos), atualizar tudo com um clique, desinstalar |
| Inicialização | Liga/desliga programas que abrem com o Windows |
| Debloat | Remove apps pré-instalados (essenciais ficam protegidos) |
| Diagnóstico | Explica desligamentos inesperados, telas azuis, erros de hardware (WHEA), travamentos do driver de vídeo e de disco |
| Drivers | Lista, dispositivos com erro, atualizações pelo Windows Update e backup |
| Windows Novo | Assistente pós-formatação: ponto de restauração, programas, debloat, privacidade, IA, boost, limpeza |
| Manutenção | Revisão semanal (CHKDSK + DISM + SFC) e ferramentas: DNS, IP, rede, Windows Update, impressora, áudio, cache de ícones, Store, relógio — mostra o comando antes de rodar |
| Monitor e Overlay | Gráficos ao vivo e overlay por cima do jogo com FPS, 1% low, frame time, CPU, GPU, VRAM, RAM, ping e perda (Ctrl+Shift+F10) |
| Rede | Teste de velocidade (Cloudflare), ping, jitter e perda de pacotes |
| Testes | Mouse (polling rate, cliques), monitor (Hz real, cores, ghosting), teclado, XMP |

## Estrutura

```
src/
  main/            processo principal (Electron)
    main.js        janelas, IPC, bandeja, overlay, autoteste
    ps.js          executor de PowerShell e programas
    modules/       um módulo por área (tweaks, games, gpu, hwmon, memory, repair…)
  renderer/        interface
    tokens.css     tokens do design system (cores, raio, espaçamento, movimento)
    styles.css     componentes e animações
    js/pages/      uma página por arquivo
tools/             make-icon.js (gera o ícone) e fps-test.html (animação para testar o overlay)
design-plans/      planos de melhoria de interface
```

## Observações técnicas

- O FPS usa o [PresentMon](https://github.com/GameTechDev/PresentMon) da Intel, baixado pelo próprio app (página Monitor).
- A temperatura da CPU não é lida: o Windows não a expõe sem um driver de kernel (PawnIO/WinRing0), que o app não instala.
- A afinidade de núcleos é aplicada quando o jogo abre (app aberto ou na bandeja) ou por atalho otimizado.
- Animações decorativas pausam quando a janela não está em foco; respeita "reduzir movimento" do Windows.
- Dados do app: `%APPDATA%\HS TECH`.

## Autoteste

```bash
HSTECH_SELFTEST=<pasta> npx electron .
```

Abre cada página fora da tela, salva capturas e o console. Variáveis extras: `HSTECH_PAGES`, `HSTECH_WAIT`, `HSTECH_H`, `HSTECH_OVERLAY`, `HSTECH_FBTEST`, `HSTECH_NAVTEST`, `HSTECH_SPLASH`, `HSTECH_MOUSETEST`, `HSTECH_BENCH`.
