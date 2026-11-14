import { call, esc, icon, busy, toast, modal, logBox, $, $$ } from '../ui.js';

let log;

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Debloat</h1><p>Remove apps que vêm com o Windows e que pouca gente usa. Os marcados como <b>recomendado</b> são seguros de tirar. Apps essenciais (Store, Fotos, Calculadora, Terminal, Bloco de Notas, extensões de mídia, winget) ficam protegidos e nem aparecem aqui.</p></div>
    <div class="actions"><button class="btn" id="rec">${icon('sparkle')}Marcar Recomendados</button><button class="btn danger" id="go">${icon('trash')}Remover Selecionados</button></div></div>
  <div class="card"><div id="list" class="list"><div class="empty">Lendo apps instalados…</div></div></div>
  <div class="card mt"><h3>Registro</h3><div id="log"></div></div>
  <div class="small muted mt">Quase todos podem ser reinstalados depois pela Microsoft Store. Crie um ponto de restauração antes, se quiser (página Reparo).</div>`;
  log = logBox('debloat', $('#log', el));
  $('#rec', el).addEventListener('click', () => $$('#list input', el).forEach((i) => { i.checked = i.dataset.rec === '1'; }));
  $('#go', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const names = $$('#list input', el).filter((i) => i.checked).map((i) => i.dataset.name);
    if (!names.length) { toast('Nada selecionado', 'warn'); return; }
    const ok = await modal({ title: `Remover ${names.length} app(s)?`, body: `<div class="small mono" style="max-height:200px;overflow:auto">${names.map(esc).join('<br>')}</div>`, okText: 'Remover Apps', danger: true });
    if (!ok) return;
    log.clear();
    const r = await call('debloat:remove', names);
    toast(`${r.filter((x) => x.ok).length} de ${r.length} removido(s)`, 'ok');
    load(el);
  }, 'Removendo…'));
  load(el);
}

async function load(el) {
  const apps = await call('debloat:list');
  const list = $('#list', el);
  if (!apps.length) { list.innerHTML = '<div class="empty">Nenhum app removível encontrado. Seu Windows já está limpo.</div>'; return; }
  list.innerHTML = apps.map((a) => `
    <label class="item check" style="cursor:pointer"><input type="checkbox" data-name="${esc(a.name)}" data-rec="${a.recommended ? 1 : 0}" ${a.recommended ? 'checked' : ''}>
      <div class="grow"><div class="row" style="gap:8px"><span class="title">${esc(a.label)}</span>${a.recommended ? '<span class="badge info">recomendado</span>' : ''}${a.hint ? `<span class="badge warn">${esc(a.hint)}</span>` : ''}${a.thirdParty ? '<span class="badge">terceiros</span>' : ''}</div>
      <div class="desc mono">${esc(a.name)} · ${esc(a.version)}</div></div></label>`).join('');
}

export function unmount() { if (log) log.dispose(); }
