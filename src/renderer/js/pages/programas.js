import { api, call, esc, fmtBytes, icon, busy, toast, modal, logBox, $, $$ } from '../ui.js';

let tab = 'install';
let logs = [];

export async function render(el) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('tab')) tab = q.get('tab');
  el.innerHTML = `
  <div class="page-head"><div><h1>Programas</h1><p>Instale, atualize e desinstale programas. A instalação e a atualização usam o <b>winget</b>, gerenciador oficial do Windows: baixa sempre a versão oficial, sem propaganda e sem "next, next".</p></div></div>
  <div class="tabs" id="tabs">${[['install', 'Instalar'], ['update', 'Atualizar'], ['uninstall', 'Desinstalar']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
  <div id="body"></div>`;
  $('#tabs', el).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    tab = b.dataset.t;
    $$('#tabs button', el).forEach((x) => x.classList.toggle('active', x === b));
    show(el);
  });
  show(el);
}

function show(el) {
  logs.forEach((l) => l.dispose()); logs = [];
  const body = $('#body', el);
  ({ install, update, uninstall })[tab](body);
}

// ---------------- Instalar ----------------
async function install(body) {
  body.innerHTML = `<div class="card empty">Carregando catálogo…</div>`;
  const [cat, ver] = await Promise.all([call('winget:catalog'), api.call('winget:available').catch(() => null)]);
  if (!ver) {
    body.innerHTML = `<div class="card"><h3>Winget Não Encontrado</h3><p class="muted">O winget vem com o "Instalador de Aplicativo" da Microsoft Store. Atualize-o pela Store e volte aqui.</p><button class="btn" id="store">Abrir na Microsoft Store</button></div>`;
    $('#store', body).addEventListener('click', () => call('shell:open', 'ms-windows-store://pdp/?productid=9NBLGGH4NNS1'));
    return;
  }
  body.innerHTML = `
    <div class="card mb"><div class="row"><b>Seleção rápida:</b>
      <button class="btn sm" data-preset="gamer">${icon('game')}Kit Gamer</button><button class="btn sm" data-preset="basico">Kit Básico</button><button class="btn sm" data-preset="tech">Kit Tech</button><button class="btn sm ghost" id="none">Limpar Seleção</button>
      <span class="spacer"></span><span class="small muted" id="count">0 selecionado(s)</span><button class="btn primary" id="go">${icon('download')}Instalar Selecionados</button></div>
      <div class="small muted mt">winget ${esc(ver)} · <span id="instState">verificando o que já está instalado…</span></div></div>
    <div class="grid g3" id="cats">${cat.categories.map((c) => `<div class="card"><h3>${esc(c.cat)}</h3><div class="list">${c.items.map((i) => `
      <label class="check" style="padding:5px 0"><input type="checkbox" data-id="${esc(i.id)}"><span class="grow">${esc(i.name)}</span><span class="badge ok hidden" data-inst="${esc(i.id)}">instalado</span></label>`).join('')}</div></div>`).join('')}</div>
    <div class="card mt"><h3>Instalação</h3><div id="log"></div></div>`;
  const log = logBox('install', $('#log', body)); logs.push(log);
  const boxes = () => $$('#cats input', body);
  const count = () => { $('#count', body).textContent = `${boxes().filter((b) => b.checked).length} selecionado(s)`; };
  boxes().forEach((b) => b.addEventListener('change', count));
  body.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const ids = cat.presets[b.dataset.preset];
    boxes().forEach((x) => { if (ids.includes(x.dataset.id) && !x.disabled) x.checked = true; });
    count();
  }));
  $('#none', body).addEventListener('click', () => { boxes().forEach((x) => { x.checked = false; }); count(); });
  api.call('winget:installedIds').then((ids) => {
    const set = new Set(ids.map((x) => x.toLowerCase()));
    let n = 0;
    body.querySelectorAll('[data-inst]').forEach((b) => { if (set.has(b.dataset.inst.toLowerCase())) { b.classList.remove('hidden'); n++; } });
    const s = $('#instState', body); if (s) s.textContent = `${n} do catálogo já instalado(s)`;
  }).catch(() => {});
  $('#go', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.dataset.id);
    if (!ids.length) { toast('Selecione pelo menos um programa', 'warn'); return; }
    log.clear();
    const r = await call('winget:install', ids, 'install');
    const ok = r.filter((x) => x.ok).length;
    toast(`${ok} de ${r.length} instalado(s)`, ok === r.length ? 'ok' : 'warn', 7000);
    install(body);
  }, 'Instalando…'));
}

// ---------------- Atualizar ----------------
async function update(body) {
  body.innerHTML = `
    <div class="card mb"><div class="row"><span id="ustate" class="muted">Procurando atualizações…</span><span class="spacer"></span>
      <button class="btn" id="re">${icon('refresh')}Procurar Novamente</button><button class="btn" id="sel" disabled>Atualizar Selecionados</button><button class="btn primary" id="all" disabled>${icon('download')}Atualizar Tudo</button></div></div>
    <div class="card"><div id="ulist" class="scroll"></div></div>
    <div class="card mt"><h3>Atualização</h3><div id="log"></div></div>`;
  const log = logBox('updates', $('#log', body)); logs.push(log);
  const load = async () => {
    $('#ustate', body).textContent = 'Procurando atualizações…';
    $('#ulist', body).innerHTML = '<div class="empty">Consultando o winget (pode levar até 1 minuto)...</div>';
    const list = await call('winget:upgradable');
    $('#ustate', body).textContent = list.length ? `${list.length} programa(s) com atualização disponível` : 'Tudo atualizado ✓';
    $('#all', body).disabled = !list.length; $('#sel', body).disabled = !list.length;
    $('#ulist', body).innerHTML = list.length ? `<table class="tbl"><thead><tr><th><input type="checkbox" id="chkAll" checked></th><th>Programa</th><th>Versão atual</th><th>Nova versão</th><th>ID</th></tr></thead><tbody>
      ${list.map((u) => `<tr><td><input type="checkbox" data-id="${esc(u.id)}" checked></td><td>${esc(u.name)}</td><td class="muted">${esc(u.version)}</td><td><span class="badge ok">${esc(u.available)}</span></td><td class="mono muted">${esc(u.id)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma atualização pendente.</div>';
    $('#chkAll', body)?.addEventListener('change', (e) => $$('#ulist input[data-id]', body).forEach((c) => { c.checked = e.target.checked; }));
  };
  $('#re', body).addEventListener('click', (e) => busy(e.currentTarget, load));
  $('#all', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    log.clear();
    await call('winget:upgradeAll');
    toast('Atualização concluída', 'ok');
    await load();
  }, 'Atualizando…'));
  $('#sel', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const ids = $$('#ulist input[data-id]', body).filter((c) => c.checked).map((c) => c.dataset.id);
    if (!ids.length) return;
    log.clear();
    const r = await call('winget:upgrade', ids);
    toast(`${r.filter((x) => x.ok).length} de ${r.length} atualizado(s)`, 'ok');
    await load();
  }, 'Atualizando…'));
  await load();
}

// ---------------- Desinstalar ----------------
async function uninstall(body) {
  body.innerHTML = `
    <div class="card mb"><div class="row"><input type="search" id="q" placeholder="Buscar programa…" style="flex:1"><select id="sort"><option value="name">Ordenar por nome</option><option value="size">Ordenar por tamanho</option><option value="date">Mais recentes</option></select>
      <button class="btn" id="appwiz">Abrir Programas e Recursos</button></div></div>
    <div class="card"><div id="list" class="scroll" style="max-height:600px"><div class="empty">Lendo programas instalados…</div></div></div>
    <div class="small muted mt">Apps da Microsoft Store (Xbox, Clima, Notícias…) ficam na página <b>Debloat</b>.</div>`;
  $('#appwiz', body).addEventListener('click', () => call('shell:run', 'appwiz'));
  let all = await call('apps:installed');
  const draw = () => {
    const q = $('#q', body).value.toLowerCase();
    const sort = $('#sort', body).value;
    let list = all.filter((a) => !q || (a.name + ' ' + (a.publisher || '')).toLowerCase().includes(q));
    if (sort === 'size') list = [...list].sort((a, b) => (b.size || 0) - (a.size || 0));
    if (sort === 'date') list = [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    $('#list', body).innerHTML = `<table class="tbl"><thead><tr><th>Programa</th><th>Editor</th><th>Versão</th><th>Tamanho</th><th>Instalado</th><th></th></tr></thead><tbody>
      ${list.map((a, i) => `<tr><td><b style="font-weight:600">${esc(a.name)}</b></td><td class="muted">${esc(a.publisher || '')}</td><td class="muted">${esc(a.version || '')}</td><td>${a.size ? fmtBytes(a.size) : '—'}</td>
      <td class="muted">${a.date && /^\d{8}$/.test(a.date) ? `${a.date.slice(6, 8)}/${a.date.slice(4, 6)}/${a.date.slice(0, 4)}` : '—'}</td><td><button class="btn sm danger" data-i="${all.indexOf(a)}">Desinstalar Programa</button></td></tr>`).join('')}</tbody></table>
      <div class="small muted mt">${list.length} programa(s)</div>`;
    $$('#list [data-i]', body).forEach((b) => b.addEventListener('click', async () => {
      const a = all[Number(b.dataset.i)];
      const ok = await modal({ title: `Desinstalar ${a.name}?`, body: 'O desinstalador do próprio programa vai abrir. Siga as instruções dele.', okText: 'Desinstalar Programa', danger: true });
      if (!ok) return;
      await busy(b, async () => {
        const r = await call('apps:uninstall', a);
        all = await call('apps:installed');
        const still = all.some((x) => x.key === a.key);
        toast(still ? `O desinstalador de ${a.name} terminou, mas o programa ainda aparece na lista.` : `${a.name} removido.`, still ? 'warn' : 'ok');
        draw();
      }, 'Aguardando…');
    }));
  };
  $('#q', body).addEventListener('input', draw);
  $('#sort', body).addEventListener('change', draw);
  draw();
}

export function unmount() { logs.forEach((l) => l.dispose()); logs = []; }
