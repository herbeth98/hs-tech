# Check-up mostra o estado de cada item com texto, não só com cor

Written against: unavailable (o projeto não é um repositório git; fontes conferidas em 13/11/2026)

Status: aplicado e validado em 13/11/2026 (autoteste da rota `#checkup`: badges visíveis, console sem erros; resultado 14 ok + 6 atenção batendo com o resumo).

## Evidence chain

- Surface: página Check-up do app Electron HS TECH, `src/renderer/js/pages/checkup.js`, rota `#checkup`, estado "resultado carregado" (depois que `call('sys:checkup')` responde).
- Problem: cada item da lista de verificação indica o estado (ok / atenção / problema) apenas pela cor de uma bolinha (`<span class="dot ${i.status}">`, linha 33). Não há ícone nem texto de estado. Em vários itens o texto do detalhe não revela o estado (ex.: "Plano de energia" → "GameTurbo" é `warn`, mas só a bolinha amarela diz isso).
- Design evidence: `D:\BuscadorFAST-Recebidos\2026-11-09\design.nuxt.md`, seção "Do's and Don'ts": "Don't signal state with color alone; pair with an icon or label."
- Owner: `src/renderer/js/pages/checkup.js` (função `go`, template dos itens, linhas 32–34). Os valores de `status` vêm de `src/main/modules/system.js` (`evaluateCheckup`) e podem ser `ok`, `info`, `warn` ou `bad`.
- Scope and affected surfaces: apenas a lista de itens da página Check-up.
- Uncertainty: nenhuma sobre o problema. Os rótulos dos badges seguem os termos que a própria página já usa no resumo (minúsculas, linha 29); se esses termos mudarem de caixa em outro trabalho, os dois lugares devem mudar juntos.

## Design decision

Acrescentar, em cada item, um badge de estado com texto usando o componente de badge que já existe, com o mesmo vocabulário e as mesmas variantes de cor do resumo no topo da página. A bolinha colorida continua (identidade visual), mas deixa de ser a única pista: o estado passa a ser legível pelo texto. Isso resolve a regra "nunca só cor" na origem (o template do item), sem criar padrão novo.

Mapeamento (idêntico à contagem já feita na linha 23, onde `info` conta como `ok`):

| `status` | Classe do badge | Texto |
| --- | --- | --- |
| `ok` | `badge ok` | `ok` |
| `info` | `badge ok` | `ok` |
| `warn` | `badge warn` | `atenção` |
| `bad` | `badge bad` | `problema` |

## Reuse

- `.badge`, `.badge.ok`, `.badge.warn`, `.badge.bad` em `src/renderer/styles.css` (linhas 89–92), que já usam os tokens `--ui-success`, `--ui-warning` e `--ui-error`.
- `.row` (flex com `gap: var(--space-2)`) em `src/renderer/styles.css`, para alinhar título e badge.
- Exemplar: o resumo do mesmo arquivo, `src/renderer/js/pages/checkup.js` linha 29 (`<span class="badge ok">… ok</span><span class="badge warn">… atenção</span><span class="badge bad">… problema(s)</span>`).
- Exemplar de título + badge na mesma linha: `src/renderer/js/pages/otimizacao.js`, template dos ajustes (`<div class="row" style="gap:8px"><span class="title">…</span><span class="badge info">Recomendado</span>…</div>`).

Nenhum primitivo novo é necessário.

## Changes

1. `src/renderer/js/pages/checkup.js`
   - Change: no topo do módulo, criar um mapa constante de estado para badge, por exemplo `const STATUS_BADGE = { ok: ['ok', 'ok'], info: ['ok', 'ok'], warn: ['warn', 'atenção'], bad: ['bad', 'problema'] };` (classe, texto). No template do item (linha 33), trocar `<div class="title">${esc(i.title)}</div>` por uma linha com o título e o badge: `<div class="row"><span class="title">${esc(i.title)}</span><span class="badge ${STATUS_BADGE[i.status][0]}">${STATUS_BADGE[i.status][1]}</span></div>`. Usar um fallback seguro para estados desconhecidos (ex.: `STATUS_BADGE[i.status] || STATUS_BADGE.ok`).
   - Preserve: a bolinha `.dot ${i.status}` à esquerda; o texto de detalhe (`.desc`); o botão de correção à direita e sua regra de exibição (`i.fix && i.status !== 'ok' && FIX[i.fix]`); a nota, os contadores e o veredito do topo; toda a lógica de `go`.
   - Verify: depois do check-up, todo item mostra um badge com texto ao lado do título; itens amarelos dizem "atenção", vermelhos dizem "problema", verdes e azuis dizem "ok". A contagem de cada texto bate com os números do resumo no topo.

## Scope

- Inherit: todos os itens de todos os grupos da página Check-up (Armazenamento, Memória, Desempenho, Drivers, Privacidade, Segurança, Sistema).
- Verify: o layout das linhas com título longo (ex.: "Agendamento de GPU acelerado por hardware") e com botão de correção na mesma linha, na largura mínima da janela (1080 px), em que a grade passa a 2 colunas.
- Exclude: outras bolinhas `.dot` do app que já têm texto ao lado (`drivers.js` linha 37, `monitor.js` linha 93, `otimizacao.js` linha 82) e a lista de etapas do Benchmark (`benchmark.js` linha 42), que tem o nome da etapa e o valor medido; a caixa (Title Case) dos títulos e dos termos dos badges, que é outro problema; qualquer mudança em `system.js`.

## Validation

- Product: rodar o check-up e confirmar que é possível dizer o estado de cada item sem depender da cor (por exemplo, numa captura em escala de cinza).
- Interface: rota `#checkup` com resultado carregado; item com título longo; item com botão de correção; janela em 1080 × 680 e em 1440 × 900.
- System: confirmar que o badge usa as classes existentes `.badge.ok/.warn/.bad` e nenhuma cor inline, e que não surgiu um segundo componente de rótulo de estado.
- Repository: `HSTECH_SELFTEST=<pasta> HSTECH_PAGES=checkup HSTECH_WAIT=12000 npx electron .` (na raiz `D:\HS TECH`) → gera `<pasta>\checkup.png` com os badges visíveis e `<pasta>\console.log` sem linhas de erro (`[3]`).

## Stop conditions

- Stop if `system.js` passar a produzir um valor de `status` fora de `ok`, `info`, `warn` e `bad`, porque o mapeamento teria de crescer com uma decisão de produto.
- Stop if o resumo do topo mudar de vocabulário ou de componente antes desta mudança, porque o badge do item deve seguir o mesmo exemplar.
- Stop if a mudança exigir alterar a lógica de `go`, a regra do botão de correção ou os dados do processo principal.

## Design documentation

- After acceptance and validation: none. A regra já está documentada em `design.nuxt.md` ("Don't signal state with color alone").
