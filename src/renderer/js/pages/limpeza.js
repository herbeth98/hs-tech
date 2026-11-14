import { api, call, esc, fmtBytes, icon, busy, logBox, toast, modal, $ } from '../ui.js';

let log;

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Limpeza</h1><p>Analisa o espaço ocupado por arquivos temporários e caches, e apaga só o que você marcar. Arquivos em uso são pulados.</p></div>
    <div class="actions"><button class="btn" id="scan">${icon('refresh')}Analisar Novamente</button><button class="btn primary" id="clean">${icon('broom')}Limpar Selecionados</button></div></div>
  <div class="grid g3 mb"><div class="card stat"><span class="label">Encontrado</span><span class="value" id="total">—</span></div>
    <div class="card stat"><span class="label">Selecionado</span><span class="value" id="sel">—</span></div>
    <div class="card stat"><span class="label">Liberado agora</span><span class="value" id="freed">—</span></div></div>
  <div class="card"><div class="list" id="list"><div class="empty">Analisando…</div></div></div>
  <div class="card mt"><h3>Registro</h3><div id="log"></div></div>`;
  log = logBox('clean', $('#log', el));
  $('#scan', el).addEventListener('click', (e) => busy(e.currentTarget, () => scan(el), 'Analisando…'));
  $('#clean', el).addEventListener('click', (e) => busy(e.currentTarget, () => clean(el), 'Limpando…'));
  await scan(el);
}

let cats = [];
async function scan(el) {
  const list = $('#list', el);
  list.innerHTML = '<div class="empty">Analisando…</div>';
  cats = await call('clean:scan');
  list.innerHTML = cats.map((c) => `
    <label class="item check" style="cursor:pointer"><input type="checkbox" data-id="${c.id}" ${c.checked ? 'checked' : ''}>
      <div class="grow"><div class="title">${esc(c.title)}</div><div class="desc">${esc(c.desc)}</div></div>
      <div style="text-align:right"><b>${fmtBytes(c.bytes)}</b><div class="small muted">${c.files} arquivo(s)</div></div></label>`).join('');
  list.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => sum(el)));
  $('#total', el).textContent = fmtBytes(cats.reduce((a, c) => a + c.bytes, 0));
  sum(el);
}

function selected(el) { return [...$('#list', el).querySelectorAll('input:checked')].map((i) => i.dataset.id); }
function sum(el) {
  const ids = selected(el);
  $('#sel', el).textContent = fmtBytes(cats.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.bytes, 0));
}

async function clean(el) {
  const ids = selected(el);
  if (!ids.length) { toast('Marque pelo menos uma categoria', 'warn'); return; }
  if (ids.includes('recycle')) {
    const ok = await modal({ title: 'Esvaziar a Lixeira?', body: 'Os arquivos da Lixeira serão apagados de vez e não dá para recuperar.', okText: 'Esvaziar e Limpar', danger: true });
    if (!ok) return;
  }
  log.clear();
  const r = await call('clean:run', ids);
  $('#freed', el).textContent = fmtBytes(r.freed);
  toast(`${fmtBytes(r.freed)} liberados`, 'ok');
  await scan(el);
}

export function unmount() { if (log) log.dispose(); }
