import { api, call, esc, icon, busy, toast, navigate, $ } from '../ui.js';

const LEVEL = { bad: ['bad', 'problema'], warn: ['warn', 'atenção'], info: ['info', 'informação'], ok: ['ok', 'ok'] };
const KIND = { shutdown: ['bad', 'Desligamento'], bsod: ['bad', 'Tela azul'], whea: ['warn', 'Hardware'], gpu: ['warn', 'Vídeo'], disk: ['warn', 'Disco'], thermal: ['warn', 'Temperatura'], memory: ['warn', 'Memória'] };
let last = null;

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Diagnóstico</h1><p>Descubra por que o PC desligou sozinho, reiniciou ou deu tela azul. O HS TECH lê os registros do Windows (desligamentos, telas azuis, erros de hardware, driver de vídeo, disco e temperatura) e explica a causa provável.</p></div>
    <div class="actions">
      <select id="days" aria-label="Período"><option value="7">Últimos 7 dias</option><option value="30" selected>Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select>
      <button class="btn" id="rel">${icon('activity')}Abrir Monitor de Confiabilidade</button>
      <button class="btn primary" id="run">${icon('shield')}Analisar Registros</button></div></div>
  <div id="out"><div class="card empty">Analisando os registros do Windows…</div></div>`;
  $('#run', el).addEventListener('click', (e) => busy(e.currentTarget, () => go(el), 'Analisando…'));
  $('#rel', el).addEventListener('click', () => call('diag:reliability'));
  await go(el);
}

async function go(el) {
  const out = $('#out', el);
  if (!out) return;
  out.innerHTML = '<div class="card empty">Analisando os registros do Windows…</div>';
  const days = Number($('#days', el).value);
  const r = await call('diag:run', days);
  last = r;
  if (!out.isConnected) return;
  const c = r.counts;
  const lastShut = r.lastShutdown ? new Date(r.lastShutdown).toLocaleString('pt-BR') : 'nenhum';
  out.innerHTML = `
    <div class="grid g4">
      <div class="card stat"><span class="label">Desligamentos inesperados</span><span class="value">${c.shutdowns}</span><span class="small muted">último: ${esc(lastShut)}</span></div>
      <div class="card stat"><span class="label">Telas azuis</span><span class="value">${c.bsod}</span><span class="small muted">${r.dumps.length} arquivo(s) de despejo</span></div>
      <div class="card stat"><span class="label">Erros de hardware</span><span class="value">${c.whea}</span><span class="small muted">WHEA (processador, PCIe, RAM)</span></div>
      <div class="card stat"><span class="label">Driver de vídeo</span><span class="value">${c.gpu}</span><span class="small muted">travamentos recuperados</span></div>
    </div>
    <div class="list mt">${r.findings.map((f) => `
      <div class="card mb"><div class="row"><h3 style="margin:0">${esc(f.title)}</h3><span class="badge ${LEVEL[f.level][0]}">${LEVEL[f.level][1]}</span></div>
        <p style="margin:var(--space-2) 0">${esc(f.text)}</p>
        ${f.steps.length ? `<div class="small muted">O que fazer, em ordem:</div><ol class="small" style="margin:var(--space-1) 0 0;padding-left:18px;line-height:1.7">${f.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        ${f.evidence.length ? `<details class="mt small"><summary class="muted" style="cursor:pointer">Ver ocorrências (${f.evidence.length})</summary><div class="mono mt">${f.evidence.map((e) => esc(fmtEv(e))).join('<br>')}</div></details>` : ''}
      </div>`).join('')}</div>
    <div class="grid g2 mt">
      <div class="card"><h3>Linha do Tempo</h3><div class="scroll" style="max-height:420px"><table class="tbl"><thead><tr><th>Quando</th><th>Tipo</th><th>O que aconteceu</th></tr></thead><tbody>
        ${r.timeline.map((t) => `<tr><td class="mono">${esc(new Date(t.t).toLocaleString('pt-BR'))}</td><td><span class="badge ${(KIND[t.kind] || ['info'])[0]}">${esc((KIND[t.kind] || ['', t.kind])[1])}</span></td><td>${esc(t.text)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhum evento no período.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><h3>Seu Sistema</h3><div class="kv">
          <div>Processador</div><div>${esc(r.system.cpu)} · ${r.system.cores} núcleos / ${r.system.threads} threads</div>
          <div>BIOS</div><div>${esc(r.system.bios)} (${esc(r.system.biosDate)})</div>
          <div>Ligado desde</div><div>${esc(new Date(r.system.boot).toLocaleString('pt-BR'))}</div></div>
        <h3 class="mt2">Programas Que Mais Travaram</h3>
        ${r.apps.length ? `<div class="list">${r.apps.map((a) => `<div class="item" style="padding:var(--space-2) var(--space-1)"><div class="grow">${esc(a.app)}</div><span class="badge warn">${a.count}×</span></div>`).join('')}</div>` : '<div class="small muted">Nenhum programa travou no período.</div>'}
        <h3 class="mt2">Próximos Passos no HS TECH</h3>
        <div class="row"><button class="btn sm" data-go="overclock">${icon('flame')}Abrir Teste de Estabilidade</button><button class="btn sm" data-go="reparo">${icon('wrench')}Abrir Reparo</button><button class="btn sm" data-go="drivers">${icon('chip')}Abrir Drivers</button></div>
        <div class="row mt"><button class="btn sm ghost" id="export">${icon('download')}Exportar Relatório</button></div>
      </div>
    </div>`;
  out.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
  $('#export', out).addEventListener('click', exportReport);
}

function fmtEv(e) {
  const m = String(e).match(/^(\S+)(.*)$/);
  const d = m && !Number.isNaN(Date.parse(m[1])) ? new Date(m[1]).toLocaleString('pt-BR') : m ? m[1] : e;
  return m ? `${d}${m[2]}` : String(e);
}

async function exportReport() {
  if (!last) return;
  const r = last;
  const lines = [`HS TECH - Diagnóstico (últimos ${r.days} dias)`, `Gerado em ${new Date().toLocaleString('pt-BR')}`, '',
    `Processador: ${r.system.cpu} (${r.system.cores}C/${r.system.threads}T) · BIOS ${r.system.bios} (${r.system.biosDate})`,
    `Desligamentos inesperados: ${r.counts.shutdowns} (corte de energia: ${r.counts.hard}) · Telas azuis: ${r.counts.bsod} · WHEA: ${r.counts.whea} · Driver de vídeo: ${r.counts.gpu} · Disco: ${r.counts.disk}`, ''];
  for (const f of r.findings) {
    lines.push(`## ${f.title} [${LEVEL[f.level][1]}]`, f.text);
    f.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    if (f.evidence.length) lines.push('  Ocorrências:', ...f.evidence.map((e) => `   - ${fmtEv(e)}`));
    lines.push('');
  }
  lines.push('## Linha do tempo', ...r.timeline.map((t) => `${new Date(t.t).toLocaleString('pt-BR')}  ${t.text}`));
  const p = await call('dialog:saveFile', { name: `HS-TECH-diagnostico-${new Date().toISOString().slice(0, 10)}.txt`, content: lines.join('\r\n') });
  if (p) toast('Relatório de diagnóstico salvo', 'ok');
}

export function unmount() {}
