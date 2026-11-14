# Manual do HS TECH

Este manual passa por cada tela do app, na ordem do menu lateral. Para instalar, veja o [README](../README.md).

> Antes de mudar muita coisa de uma vez, crie um ponto de restauração no **Painel**. Assim você pode voltar o Windows inteiro ao estado de antes.

## Visão Geral

**Painel.** A tela inicial. Mostra a pontuação de otimização, de 0 a 100, e o botão **Dar Boost Agora**, que aplica os ajustes recomendados, limpa arquivos e libera a memória RAM. Também tem o monitor do processador, atalhos para criar um ponto de restauração, limpar a RAM e limpar arquivos do Windows, as ações recomendadas e as informações do seu PC.

**Hardware Monitor.** Todos os sensores em uma tabela: cada núcleo do processador, a placa de vídeo, a memória, os discos e a rede, com o valor atual, o mínimo e o máximo. O botão de gravar salva tudo em CSV para abrir no Excel.

**Check-up.** Confere o PC e dá uma nota de 0 a 100, com a lista do que está bom e do que vale a pena ajustar.

**Benchmark.** Mede o processador, a memória, o disco e a placa de vídeo e dá uma pontuação. Rode antes e depois dos ajustes para comparar.

## Otimizar

**Otimização.** Os ajustes do Windows separados por assunto: desempenho, jogos, clique sem atraso, estabilidade do FPS e privacidade. Cada um mostra se já está ligado. Ligue os que quiser; o botão de desfazer volta ao que era.

**Limpeza.** Procura arquivos temporários, caches, logs antigos e restos de atualização, mostra o tamanho e apaga o que você marcar.

**Jogos.** Lista os jogos instalados (Steam, Epic, GOG, Ubisoft, EA, Riot, Battle.net e Xbox). Para cada jogo você pode liberar o núcleo 0, usar só os núcleos físicos, usar só os núcleos de desempenho, dar prioridade alta, escolher a placa de vídeo dedicada e criar um atalho já ajustado. Os ajustes valem só para aquele jogo.

**Placa de Vídeo.** Com placa NVIDIA: modo de desempenho máximo, baixa latência e limite de FPS direto no driver, além da leitura de uso, temperatura e potência.

**Overclock Seguro.** Ajustes leves com teste de estabilidade. Se algo der errado no teste, ele volta ao padrão.

## Sistema

**Programas.** Instala programas conhecidos e atualiza os que já estão no PC, todos com um clique.

**Inicialização.** Mostra o que abre junto com o Windows e deixa desligar o que você não precisa.

**Debloat.** Remove apps que vêm de fábrica com o Windows. Desligue também o Copilot e o Recall por aqui.

**Diagnóstico.** O PC desligou sozinho ou deu tela azul? Ele lê os registros do Windows e mostra o motivo provável (corte de energia, tela azul, erro de hardware, driver de vídeo) e o que fazer, em ordem.

**Drivers.** Mostra drivers com erro, procura atualizações e faz backup dos drivers instalados.

**Windows Novo.** Para um Windows recém-formatado: marque os programas, os apps para remover e os ajustes, e ele faz tudo de uma vez.

**Manutenção.** A revisão semanal confere o disco, os arquivos do Windows e a imagem do sistema. Também tem ferramentas para internet, Windows Update, impressora e áudio. O comando aparece antes de rodar.

## Ferramentas

**Monitor e Overlay.** Gráficos de processador, placa de vídeo, memória e disco. Daqui você liga o overlay que fica por cima do jogo, com FPS, 1% e 0,1% low, frame time, CPU, GPU, RAM e ping. O atalho padrão é **Ctrl + Shift + F10**. Ele funciona em janela sem bordas e na maioria dos jogos atuais; em tela cheia exclusiva, troque para janela sem bordas.

**Rede.** Teste de velocidade, ping e perda de pacotes.

**Testes.** Testes de mouse (taxa de atualização e cliques), de monitor (pixels e cores) e de teclado.

**Configurações.** Atalho do overlay e as outras preferências do app.

## Dúvidas comuns

**Por que ele pede para rodar como administrador?** Ajustes do Windows, limpeza de pastas do sistema, reparos e a leitura de FPS só funcionam com essa permissão.

**Por que não aparece a temperatura do processador?** O Windows não libera esse sensor sem um driver de baixo nível, e o HS TECH prefere não instalar nenhum. A temperatura da placa de vídeo e dos discos aparece normalmente.

**Instalador ou versão portátil?** O instalador cria atalhos e fica no PC. A versão portátil roda direto, sem instalar, e pode ir num pendrive.

**Os ajustes ficam se eu remover o app?** Ficam. Use o botão de desfazer de cada ajuste antes de remover, ou volte a um ponto de restauração.
