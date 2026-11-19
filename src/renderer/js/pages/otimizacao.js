import { api, call, esc, icon, busy, modal, toast, $, $$ } from '../ui.js';
import { runFullOptimization } from '../fullopt.js';

let tab = 'Desempenho';
let data = [];

export async function render(el) {
  const groups = await call('tweaks:groups').catch(() => []);
  el.innerHTML = `
  <div class="page-head"><div><h1>Otimização</h1><p>Cada ajuste mostra o estado atual do seu Windows. Ligue ou desligue quando quiser: tudo tem como desfazer.</p></div>
    <div class="actions"><button class="btn" id="recApply">${icon('sparkle')}Aplicar Recomendados</button><button class="btn primary" id="full">${icon('bolt')}Fazer Otimização Completa</button></div></div>
  <div class="tabs" id="tabs">${groups.map((g) => `<button data-g="${esc(g.name)}" class="${g.name === tab ? 'active' : ''}">${esc(g.label)}</button>`).join('')}</div>
  <div id="extra"></div>
  <div class="card"><div class="list" id="list"><div class="empty">Lendo o estado atual dos ajustes…</div></div></div>`;
  $('#full', el).addEventListener('click', (e) => runFullOptimization(e.currentTarget));
  $('#tabs', el).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]');
    if (!b) return;
    tab = b.dataset.g;
    $$('#tabs button', el).forEach((x) => x.classList.toggle('active', x === b));
    draw(el);
  });
  $('#recApply', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const todo = data.filter((t) => t.group === tab && t.recommended && t.active !== true);
    if (!todo.length) { toast('Todos os recomendados desta aba já estão aplicados', 'ok'); return; }
    for (const t of todo) {
      try { const r = await api.call('tweaks:set', t.id, true); t.active = r.active; } catch (err) { toast(`${t.title}: ${err.message}`, 'error', 8000); }
    }
    toast(`${todo.length} ajuste(s) aplicados`, 'ok');
    draw(el);
  }, 'Aplicando…'));
  try { data = await call('tweaks:status'); } catch { data = []; }
  draw(el);
}

function draw(el) {
  const list = $('#list', el);
  if (!list) return;
  const items = data.filter((t) => t.group === tab);
  const risk = { low: '', medium: '<span class="badge warn">Avançado</span>', high: '<span class="badge bad">Risco</span>' };
  list.innerHTML = items.map((t) => `
    <div class="item" data-id="${t.id}">
      <div class="grow"><div class="row" style="gap:8px"><span class="title">${esc(t.title)}</span>${t.recommended ? '<span class="badge info">Recomendado</span>' : ''}${risk[t.risk] || ''}</div>
        <div class="desc">${esc(t.desc)}</div>${t.note ? `<div class="desc" style="color:var(--ui-warning)">${esc(t.note)}</div>` : ''}</div>
      <span class="small ${t.active ? '' : 'muted'}" style="width:70px;text-align:right">${t.active === null ? 'indefinido' : t.active ? 'Ativo' : 'Inativo'}</span>
      <label class="switch"><input type="checkbox" ${t.active ? 'checked' : ''}><span></span></label>
    </div>`).join('') || '<div class="empty">Nenhum ajuste.</div>';
  list.querySelectorAll('.item input').forEach((inp) => inp.addEventListener('change', async () => {
    const id = inp.closest('.item').dataset.id;
    const t = data.find((x) => x.id === id);
    const want = inp.checked;
    if (want && t.risk === 'high') {
      const ok = await modal({ title: t.title, body: `<div class="callout danger">${esc(t.desc)}</div><p>Tem certeza?</p>`, okText: 'Aplicar Ajuste', danger: true });
      if (!ok) { inp.checked = false; return; }
    }
    inp.disabled = true;
    try {
      const r = await api.call('tweaks:set', id, want);
      t.active = r.active;
      if (r.output && /TAMPER/.test(r.output)) toast(r.output.replace('TAMPER: ', ''), 'warn', 12000);
      else toast(`${t.title}: ${want ? 'aplicado' : 'desfeito'}${t.note ? '. ' + t.note : ''}`, 'ok');
    } catch (e) {
      toast(`${t.title}: ${e.message.replace('TAMPER: ', '')}`, 'error', 12000);
    }
    draw(el);
  }));
  drawExtra(el);
}

async function drawExtra(el) {
  const box = $('#extra', el);
  box.innerHTML = '';
  if (tab === 'Jogos') {
    box.innerHTML = `<div class="card mb" id="nv"><h3>Overlay da NVIDIA (Alt+Z)</h3><div class="muted small">Verificando…</div></div>`;
    try {
      const s = await api.call('nvidia:status');
      const card = $('#nv', el);
      if (!card) return;
      if (!s.gpu) { card.innerHTML = '<h3>Overlay da NVIDIA</h3><div class="muted">Nenhuma placa NVIDIA encontrada.</div>'; return; }
      const running = (Array.isArray(s.running) ? s.running : s.running ? [s.running] : []);
      card.innerHTML = `<h3>Overlay da NVIDIA (Alt+Z)</h3>
        <div class="row"><span class="dot ${running.length ? 'warn' : 'ok'}"></span><span>${running.length ? `Overlay rodando (${esc(running.join(', '))})` : 'Overlay não está rodando'}</span>
          <span class="badge">${esc(s.appName || 'NVIDIA App não encontrado')} ${esc(s.version || '')}</span><span class="spacer"></span>
          <button class="btn sm" id="nvClose" ${running.length ? '' : 'disabled'}>Fechar Overlay</button>
          <button class="btn sm" id="nvOpen" ${s.appExe ? '' : 'disabled'}>Abrir NVIDIA App</button></div>
        <p class="small muted" style="margin-bottom:0">O overlay da NVIDIA (gravação, filtros, estatísticas) consome um pouco de GPU e pode conflitar com outros overlays. Para desligar de vez: NVIDIA App → Configurações → Recursos → <b>Sobreposição no jogo</b> → Desligado.</p>`;
      $('#nvClose', el)?.addEventListener('click', async () => { await call('nvidia:closeOverlay'); toast('Overlay da NVIDIA fechado', 'ok'); drawExtra(el); });
      $('#nvOpen', el)?.addEventListener('click', () => call('nvidia:openApp', s.appExe));
    } catch {}
  } else if (tab === 'Segurança') {
    box.innerHTML = `<div class="callout danger mb"><b>Atenção:</b> desligar o Defender deixa o PC sem proteção. A <b>Proteção contra adulteração</b> precisa estar desligada em Segurança do Windows para o HS TECH conseguir mudar isso. <button class="btn sm" id="wd" style="margin-left:8px">Abrir Segurança do Windows</button></div>`;
    $('#wd', el).addEventListener('click', () => call('shell:run', 'windowsdefender'));
  } else if (tab === 'Input lag' || tab === 'Estabilidade de FPS') {
    box.innerHTML = `<div class="callout mb">Para medir o efeito, compare o FPS mostrado pelo próprio jogo (ou pelo overlay da NVIDIA, Alt+R) antes e depois. Nos jogos com <b>NVIDIA Reflex</b>, ative o Reflex no jogo: ele reduz mais input lag que qualquer ajuste do Windows.</div>`;
  }
}

export function unmount() {}
