import { call, esc, fmt, icon, $, $$ } from '../ui.js';

let cleanup = [];
let tab = 'mouse';

export async function render(el) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('tab')) tab = q.get('tab');
  el.innerHTML = `
  <div class="page-head"><div><h1>Testes</h1><p>Teste de mouse, de monitor e de teclado, e verificação da memória (XMP/EXPO).</p></div></div>
  <div class="tabs" id="tabs">${[['mouse', 'Mouse'], ['monitor', 'Monitor'], ['teclado', 'Teclado'], ['xmp', 'Memória (XMP)']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
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
  cleanup.forEach((f) => f()); cleanup = [];
  const body = $('#body', el);
  ({ mouse, monitor, teclado, xmp })[tab](body);
}

// ---------------- Mouse ----------------
function mouse(body) {
  body.innerHTML = `
  <div class="grid g2">
    <div class="card"><h3>Taxa de Atualização (Polling Rate)</h3><div class="sub">Mexa o mouse rápido, em círculos, dentro da área abaixo.</div>
      <div class="mouse-pad" id="pad"><div style="text-align:center"><div style="font-size:44px;font-weight:800" id="hz">—</div><div>Hz agora</div></div></div>
      <div class="grid g3 mt"><div class="stat"><span class="label">Média</span><span class="value" id="avg">—</span></div><div class="stat"><span class="label">Máximo</span><span class="value" id="max">—</span></div><div class="stat"><span class="label">Estável em</span><span class="value" id="nominal">—</span></div></div>
      <div class="small muted mt">Mouses comuns: 125 Hz. Gamers: 500, 1000 Hz ou mais. Se der bem abaixo do configurado no software do mouse, teste outra porta USB (de preferência atrás do PC, sem hub).</div></div>
    <div class="card"><h3>Botões e Cliques</h3><div class="sub">Clique em cada botão em cima da área. A contagem de duplo clique acidental (menos de 80 ms entre cliques) ajuda a achar switch com defeito.</div>
      <div class="btns-mouse" id="btns">${['Esquerdo', 'Meio', 'Direito', 'Voltar', 'Avançar'].map((n, i) => `<div class="mbtn" data-b="${i}"><b>0</b>${n}<div class="small muted" data-d="${i}">0 duplos</div></div>`).join('')}</div>
      <div class="mouse-pad mt" id="clickpad" style="height:150px">Clique aqui</div>
      <div class="grid g3 mt"><div class="stat"><span class="label">CPS</span><span class="value" id="cps">0</span></div><div class="stat"><span class="label">Rolagem ↑</span><span class="value" id="wu">0</span></div><div class="stat"><span class="label">Rolagem ↓</span><span class="value" id="wd">0</span></div></div>
      <button class="btn sm mt" id="reset">Zerar Contagem</button></div>
  </div>`;
  const pad = $('#pad', body);
  let events = [];
  const samples = [];
  const evName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  const onMove = (e) => { events.push(e.timeStamp); };
  pad.addEventListener(evName, onMove);
  const timer = setInterval(() => {
    const now = performance.now();
    events = events.filter((t) => now - t < 1000);
    if (events.length > 20) {
      const hz = events.length;
      samples.push(hz); if (samples.length > 30) samples.shift();
      $('#hz', body).textContent = hz;
      $('#avg', body).textContent = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      $('#max', body).textContent = Math.max(...samples);
      const max = Math.max(...samples);
      const nominal = [125, 250, 500, 1000, 2000, 4000, 8000].reduce((best, n) => (Math.abs(n - max) < Math.abs(best - max) ? n : best), 125);
      $('#nominal', body).textContent = `${nominal} Hz`;
    } else if ($('#hz', body)) $('#hz', body).textContent = '—';
  }, 250);
  cleanup.push(() => clearInterval(timer));

  const counts = [0, 0, 0, 0, 0];
  const doubles = [0, 0, 0, 0, 0];
  const lastDown = [0, 0, 0, 0, 0];
  let clicks = [];
  let wu = 0, wd = 0;
  const cp = $('#clickpad', body);
  cp.addEventListener('contextmenu', (e) => e.preventDefault());
  cp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const b = e.button;
    if (b > 4) return;
    counts[b]++;
    if (e.timeStamp - lastDown[b] < 80) doubles[b]++;
    lastDown[b] = e.timeStamp;
    clicks.push(e.timeStamp);
    const box = body.querySelector(`.mbtn[data-b="${b}"]`);
    box.classList.add('down'); box.querySelector('b').textContent = counts[b];
    body.querySelector(`[data-d="${b}"]`).textContent = `${doubles[b]} duplos`;
    if (doubles[b]) body.querySelector(`[data-d="${b}"]`).style.color = 'var(--ui-error)';
  });
  cp.addEventListener('mouseup', (e) => { const box = body.querySelector(`.mbtn[data-b="${e.button}"]`); if (box) box.classList.remove('down'); });
  cp.addEventListener('wheel', (e) => { e.preventDefault(); if (e.deltaY < 0) wu++; else wd++; $('#wu', body).textContent = wu; $('#wd', body).textContent = wd; }, { passive: false });
  const ct = setInterval(() => { const now = performance.now(); clicks = clicks.filter((t) => now - t < 1000); const c = $('#cps', body); if (c) c.textContent = clicks.length; }, 100);
  cleanup.push(() => clearInterval(ct));
  $('#reset', body).addEventListener('click', () => show(body.closest('.main')));
}

// ---------------- Monitor ----------------
function monitor(body) {
  body.innerHTML = `
  <div class="grid g2">
    <div class="card"><h3>Taxa de Atualização Real</h3><div class="sub">Mede quantos quadros por segundo o monitor está exibindo agora.</div>
      <div class="row"><div class="stat"><span class="label">Medido</span><span class="value" id="hzv">—</span></div><span class="spacer"></span><button class="btn" id="hzrun">${icon('gauge')}Medir Taxa</button></div>
      <div class="small muted mt" id="hzNote">Se der 60 Hz num monitor de 144/165/240 Hz: Configurações → Sistema → Tela → Tela avançada → escolha a taxa máxima. Confira também se o cabo é DisplayPort ou HDMI 2.0+.</div></div>
    <div class="card"><h3>Pixels Mortos e Uniformidade</h3><div class="sub">Abre cores em tela cheia. Clique ou aperte → para trocar a cor e Esc para sair.</div>
      <button class="btn" id="dead">${icon('monitor')}Iniciar Teste de Cores</button></div>
    <div class="card"><h3>Ghosting e Fluidez</h3><div class="sub">Blocos se movendo em velocidades diferentes. Rastro ou borrão = ghosting/overdrive. Movimento travado = frames perdidos.</div>
      <button class="btn" id="motion">${icon('play')}Iniciar Teste de Movimento</button></div>
    <div class="card"><h3>Gradiente e Banding</h3><div class="sub">Degradês em tela cheia: faixas visíveis indicam pouca profundidade de cor ou compressão.</div>
      <button class="btn" id="grad">${icon('layers')}Iniciar Teste de Gradiente</button></div>
  </div>`;
  $('#hzrun', body).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const times = [];
    await new Promise((resolve) => {
      let last = 0;
      const step = (t) => { if (last) times.push(t - last); last = t; if (times.length < 240) requestAnimationFrame(step); else resolve(); };
      requestAnimationFrame(step);
    });
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    $('#hzv', body).textContent = `${(1000 / med).toFixed(1)} Hz`;
    e.currentTarget.disabled = false;
  });
  $('#dead', body).addEventListener('click', () => fullscreen((div, next) => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080', '#ffff00', '#00ffff', '#ff00ff'];
    let i = 0;
    const paint = () => { div.style.background = colors[i % colors.length]; };
    paint();
    next(() => { i++; paint(); });
  }, 'Clique ou → para trocar a cor · Esc para sair'));
  $('#grad', body).addEventListener('click', () => fullscreen((div, next) => {
    const g = ['linear-gradient(90deg,#000,#fff)', 'linear-gradient(90deg,#000,#f00)', 'linear-gradient(90deg,#000,#0f0)', 'linear-gradient(90deg,#000,#00f)', 'linear-gradient(90deg,#101010,#202020)'];
    let i = 0;
    const paint = () => { div.style.background = g[i % g.length]; };
    paint(); next(() => { i++; paint(); });
  }, 'Clique ou → para trocar · Esc para sair'));
  $('#motion', body).addEventListener('click', () => fullscreen((div) => {
    div.style.background = 'var(--ui-bg)';
    const speeds = [240, 480, 960, 1920];
    div.innerHTML = speeds.map((s, i) => `<div style="position:absolute;left:0;top:${12 + i * 22}%;height:12%;width:100%;border-top:1px solid var(--ui-border-accented)"><span style="position:absolute;left:12px;top:6px;color:var(--ui-text-highlighted);font:600 14px var(--font-sans)">${s} px/s</span><div data-s="${s}" style="position:absolute;top:28%;width:80px;height:56%;background:var(--ui-text-highlighted);border-radius:var(--radius-md);box-shadow:inset 0 0 0 6px var(--ui-primary)"></div></div>`).join('');
    const boxes = [...div.querySelectorAll('[data-s]')];
    let raf; const t0 = performance.now();
    const loop = (t) => {
      const w = div.clientWidth + 80;
      boxes.forEach((b) => { const x = (((t - t0) / 1000) * Number(b.dataset.s)) % w - 80; b.style.transform = `translateX(${x}px)`; });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, 'Esc para sair'));
}

function fullscreen(setup, hint) {
  const div = document.createElement('div');
  div.className = 'fullscreen-test';
  const h = document.createElement('div');
  h.className = 'fs-hint'; h.textContent = hint;
  document.body.append(div, h);
  let nextFn = null;
  const dispose = setup(div, (fn) => { nextFn = fn; });
  div.requestFullscreen().catch(() => {});
  setTimeout(() => h.remove(), 3500);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    if (typeof dispose === 'function') dispose();
    div.remove(); h.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === ' ') nextFn && nextFn(); };
  document.addEventListener('keydown', onKey);
  div.addEventListener('click', () => (nextFn ? nextFn() : close()));
  document.addEventListener('fullscreenchange', function f() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', f); close(); } });
}

// ---------------- Teclado ----------------
function teclado(body) {
  const rows = [
    ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
    ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Enter'],
    ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
    ['ShiftLeft', 'IntlBackslash', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'IntlRo', 'ShiftRight'],
    ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']
  ];
  const label = (c) => c.replace(/^Key|^Digit/, '').replace('Left', ' E').replace('Right', ' D').replace('Arrow', '').replace('Backquote', "'").replace('Space', 'Espaço');
  body.innerHTML = `<div class="card"><h3>Teste de Teclado</h3><div class="sub">Aperte as teclas. Cada tecla que responde fica verde. Também mostra o tempo de cada toque (útil para ver tecla "pegando").</div>
    <div>${rows.map((r) => `<div>${r.map((c) => `<span class="key" data-code="${c}" style="${c === 'Space' ? 'min-width:220px' : ''}">${esc(label(c))}</span>`).join('')}</div>`).join('')}</div>
    <div class="row mt"><span class="small muted" id="kinfo">Aperte uma tecla…</span></div></div>`;
  const downAt = {};
  const onDown = (e) => { e.preventDefault(); if (!downAt[e.code]) downAt[e.code] = e.timeStamp; const k = body.querySelector(`[data-code="${e.code}"]`); if (k) k.classList.add('hit'); };
  const onUp = (e) => { e.preventDefault(); const dt = downAt[e.code] ? e.timeStamp - downAt[e.code] : 0; delete downAt[e.code]; const i = $('#kinfo', body); if (i) i.textContent = `${e.code} · tecla "${e.key}" · pressionada por ${fmt(dt)} ms`; };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  cleanup.push(() => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); });
}

// ---------------- XMP ----------------
async function xmp(body) {
  body.innerHTML = '<div class="card empty">Lendo os pentes de memória…</div>';
  try {
    const x = await call('sys:xmp');
    const cls = x.verdict === 'warn' ? 'warn' : x.verdict === 'ok' ? 'ok' : 'info';
    body.innerHTML = `
      <div class="card hero"><div class="row"><span class="badge ${cls}">${x.verdict === 'warn' ? 'XMP/EXPO provavelmente desligado' : x.verdict === 'ok' ? 'XMP/EXPO ativo' : 'Verifique'}</span><span class="badge">${esc(x.typeName)}</span><span class="badge">${fmt(x.totalGB)} GB</span></div>
        <h2 class="mt" style="font-size:20px">${fmt(x.configured)} MT/s <span class="muted" style="font-size:14px;font-weight:500">em uso · suportado ${fmt(x.rated)} MT/s${x.partSpeed ? ` · código do pente indica ${x.partSpeed}` : ''}</span></h2>
        <p>${esc(x.text)}</p><p class="muted">${esc(x.channel)}</p></div>
      <div class="card mt"><h3>Pentes Instalados</h3><table class="tbl"><thead><tr><th>Slot</th><th>Fabricante</th><th>Modelo</th><th>Capacidade</th><th>Suportado</th><th>Em uso</th></tr></thead>
        <tbody>${x.modules.map((m) => `<tr><td>${esc(m.slot)}</td><td>${esc(m.maker)}</td><td class="mono">${esc(m.part)}</td><td>${fmt(m.cap / 1073741824)} GB</td><td>${fmt(m.speed)} MT/s</td><td>${fmt(m.conf)} MT/s</td></tr>`).join('')}</tbody></table></div>
      <div class="card mt"><h3>Como Ativar o XMP/EXPO</h3><ol class="small" style="margin:0;padding-left:18px;line-height:1.8">
        <li>Reinicie e entre na BIOS (Del ou F2 na tela de início).</li>
        <li>Procure <b>XMP</b> (Intel), <b>EXPO</b> ou <b>DOCP</b> (AMD), geralmente em AI Tweaker, OC ou Memory.</li>
        <li>Escolha o <b>Perfil 1</b>, salve e saia (F10).</li>
        <li>Volte aqui e confira se a velocidade em uso subiu. Se o PC não ligar, a placa volta ao padrão sozinha após algumas tentativas.</li></ol></div>`;
  } catch (e) { body.innerHTML = `<div class="card">Não foi possível ler a memória: ${esc(e.message)}</div>`; }
}

export function unmount() { cleanup.forEach((f) => f()); cleanup = []; }
