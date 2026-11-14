import { api, call, esc, icon, busy, toast, $ } from '../ui.js';

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Inicialização</h1><p>Programas que abrem junto com o Windows. Desativar não desinstala nada: o programa só deixa de abrir sozinho. É o mesmo controle do Gerenciador de Tarefas.</p></div>
    <div class="actions"><button class="btn" id="re">${icon('refresh')}Atualizar Lista</button><button class="btn" id="tm">Abrir Gerenciador de Tarefas</button></div></div>
  <div class="card"><div class="list" id="list"><div class="empty">Lendo…</div></div></div>
  <div class="callout small mt">Dica: mantenha ligados os itens do driver de áudio, do touchpad e do antivírus. Launchers de jogos, Discord, Spotify, OneDrive e atualizadores podem ser desligados sem problema e abertos quando você quiser.</div>`;
  $('#re', el).addEventListener('click', (e) => busy(e.currentTarget, () => load(el)));
  $('#tm', el).addEventListener('click', () => call('shell:run', 'taskmgr'));
  await load(el);
}

const SAFE_HINT = /(realtek|nahimic|synaptics|elan|igfx|rtkaudio|audio|securityhealth|windowsdefender|ctfmon|bluetooth|touchpad|nvcpl|amd ?software|radeon)/i;

async function load(el) {
  const items = await call('startup:list');
  const list = $('#list', el);
  if (!items.length) { list.innerHTML = '<div class="empty">Nenhum programa na inicialização.</div>'; return; }
  items.sort((a, b) => (b.enabled - a.enabled) || a.name.localeCompare(b.name));
  const on = items.filter((i) => i.enabled).length;
  list.innerHTML = `<div class="small muted" style="padding:0 4px 8px">${on} de ${items.length} ativado(s)</div>` + items.map((it, i) => `
    <div class="item"><div class="grow"><div class="row" style="gap:8px"><span class="title">${esc(it.name)}</span><span class="badge">${esc(it.scope)}</span>${SAFE_HINT.test(it.name + it.command) ? '<span class="badge info">sistema/driver: melhor manter</span>' : ''}</div>
      <div class="desc mono ellipsis" title="${esc(it.command)}">${esc(it.command)}</div></div>
      <span class="small ${it.enabled ? '' : 'muted'}" style="width:70px;text-align:right">${it.enabled ? 'Ativado' : 'Desativado'}</span>
      <label class="switch"><input type="checkbox" data-i="${i}" ${it.enabled ? 'checked' : ''}><span></span></label></div>`).join('');
  list.querySelectorAll('input[data-i]').forEach((inp) => inp.addEventListener('change', async () => {
    const it = items[Number(inp.dataset.i)];
    inp.disabled = true;
    try {
      await api.call('startup:set', it, inp.checked);
      toast(`${it.name}: ${inp.checked ? 'vai abrir com o Windows' : 'não abre mais com o Windows'}`, 'ok');
    } catch (e) { toast(e.message, 'error'); inp.checked = !inp.checked; }
    load(el);
  }));
}

export function unmount() {}
