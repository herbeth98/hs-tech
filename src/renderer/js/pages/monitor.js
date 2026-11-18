import { api, call, esc, fmt, fmtBytes, icon, busy, toast, drawLine, $ } from '../ui.js';

let off = [];
const H = { cpu: [], gpu: [], ram: [], disk: [], vram: [], rx: [], tx: [], fps: [] };
const MAXN = 120;
const push = (k, v) => { H[k].push(v); if (H[k].length > MAXN) H[k].shift(); };

const METRICS = [
  ['fps', 'FPS'], ['low1', '1% low'], ['low01', '0,1% low'], ['frametime', 'Frame time'], ['graph', 'Gráfico de frame time'], ['game', 'Nome do jogo'],
  ['cpu', 'Uso da CPU'], ['cpuClock', 'Clock da CPU'], ['gpu', 'Uso da GPU'], ['gpuTemp', 'Temperatura da GPU'], ['clock', 'Clock da GPU'], ['power', 'Potência da GPU'],
  ['vram', 'VRAM'], ['ram', 'RAM'], ['ping', 'Ping'], ['loss', 'Perda de pacotes'], ['speed', 'Último teste de velocidade']
];

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Monitor e Overlay</h1><p>Desempenho em tempo real. O overlay mostra FPS, 1% low, CPU, GPU, RAM e rede por cima do jogo. Atalho: <b id="hk"></b>.</p></div>
    <div class="actions"><button class="btn primary" id="ovl">${icon('layers')}Mostrar Overlay</button></div></div>
  <div class="grid g2">
    ${card('cpu', 'CPU', 'var(--ui-text-highlighted)')}${card('gpu', 'GPU', 'var(--ui-text-highlighted)')}${card('ram', 'Memória RAM', 'var(--ui-text-highlighted)')}${card('disk', 'Disco', 'var(--ui-text-highlighted)')}
  </div>
  <div class="grid g2 mt">
    <div class="card"><div class="row between"><h3 style="margin:0">Rede</h3><span class="small muted" id="v-net">—</span></div><canvas class="chart mt" id="c-net"></canvas>
      <div class="small muted"><span class="c-primary">●</span> download <span style="color:var(--ui-text-muted);margin-left:10px">●</span> upload</div></div>
    <div class="card"><div class="row between"><h3 style="margin:0">FPS do Jogo</h3><span class="small muted" id="v-fps">—</span></div>
      <div id="fpsBox" class="mt"></div><canvas class="chart mt" id="c-fps"></canvas></div>
  </div>
  <div class="card mt"><h3>Configurar Overlay</h3>
    <div class="grid g3">
      <label class="small muted">Posição<select id="pos" style="width:100%;margin-top:4px"><option value="top-left">Canto superior esquerdo</option><option value="top-right">Canto superior direito</option><option value="bottom-left">Canto inferior esquerdo</option><option value="bottom-right">Canto inferior direito</option></select></label>
      <label class="small muted">Tamanho <span id="scv"></span><input type="range" id="scale" min="0.7" max="1.6" step="0.05" style="width:100%"></label>
      <label class="small muted">Opacidade do fundo <span id="opv"></span><input type="range" id="opacity" min="0" max="1" step="0.05" style="width:100%"></label>
      <label class="small muted">Atalho para mostrar/esconder<select id="hotkey" style="width:100%;margin-top:4px">${['Control+Shift+F10', 'Control+Shift+O', 'Alt+F10', 'Control+Alt+O', 'F10'].map((k) => `<option>${k}</option>`).join('')}</select></label>
      <label class="small muted">Servidor do ping<input type="text" id="host" style="width:100%;margin-top:4px" placeholder="1.1.1.1"></label>
    </div>
    <div class="small muted mt">Itens exibidos</div>
    <div class="row mt" id="metrics" style="gap:14px">${METRICS.map(([k, l]) => `<label class="check"><input type="checkbox" data-k="${k}">${esc(l)}</label>`).join('')}</div>
    <div class="callout small mt">O overlay aparece em jogos em <b>janela sem bordas</b> e na maioria dos jogos DirectX 12/Vulkan em tela cheia (o Windows 11 usa flip model). Em jogos antigos em tela cheia exclusiva, use o modo janela sem bordas.</div>
  </div>`;

  const settings = await call('app:settings');
  const o = settings.overlay;
  $('#hk', el).textContent = o.hotkey.replace('Control', 'Ctrl');
  $('#pos', el).value = o.position; $('#scale', el).value = o.scale; $('#opacity', el).value = o.opacity; $('#hotkey', el).value = o.hotkey; $('#host', el).value = settings.pingHost;
  $('#scv', el).textContent = `${Math.round(o.scale * 100)}%`; $('#opv', el).textContent = `${Math.round(o.opacity * 100)}%`;
  el.querySelectorAll('#metrics input').forEach((i) => { i.checked = !!o.show[i.dataset.k]; });
  // Itens do overlay vivem em 3 lugares (DEFAULT_SETTINGS.overlay.show no main.js, METRICS aqui e overlay.js): avisa se divergirem.
  const keys = METRICS.map(([k]) => k);
  const diff = [...keys.filter((k) => !(k in o.show)), ...Object.keys(o.show).filter((k) => !keys.includes(k))];
  if (diff.length) console.warn(`[overlay] itens fora de sincronia entre main.js e METRICS: ${diff.join(', ')}`);
  const save = (patch) => call('app:settings', patch);
  $('#pos', el).addEventListener('change', (e) => save({ overlay: { position: e.target.value } }));
  $('#scale', el).addEventListener('input', (e) => { $('#scv', el).textContent = `${Math.round(e.target.value * 100)}%`; save({ overlay: { scale: Number(e.target.value) } }); });
  $('#opacity', el).addEventListener('input', (e) => { $('#opv', el).textContent = `${Math.round(e.target.value * 100)}%`; save({ overlay: { opacity: Number(e.target.value) } }); });
  $('#hotkey', el).addEventListener('change', (e) => { save({ overlay: { hotkey: e.target.value } }); $('#hk', el).textContent = e.target.value.replace('Control', 'Ctrl'); });
  $('#host', el).addEventListener('change', (e) => save({ pingHost: e.target.value.trim() || '1.1.1.1' }));
  el.querySelectorAll('#metrics input').forEach((i) => i.addEventListener('change', () => save({ overlay: { show: { [i.dataset.k]: i.checked } } })));

  const ovl = $('#ovl', el);
  const setOvl = (on) => { ovl.innerHTML = `${icon('layers')}${on ? 'Esconder Overlay' : 'Mostrar Overlay'}`; };
  setOvl(await call('overlay:state'));
  ovl.addEventListener('click', async () => setOvl(await call('overlay:toggle')));
  off.push(api.on('overlay:state', setOvl));

  await drawFpsBox(el);
  call('monitor:start');
  off.push(api.on('monitor:sample', (s) => update(el, s)));
}

function card(id, title, color) {
  return `<div class="card"><div class="row between"><h3 style="margin:0">${title}</h3><span class="small muted" id="v-${id}">—</span></div>
    <div class="row" style="align-items:flex-end;gap:6px"><span style="font-size:30px;font-weight:700;color:${color}" id="b-${id}">—</span><span class="muted" id="s-${id}"></span></div>
    <canvas class="chart" id="c-${id}"></canvas></div>`;
}

async function drawFpsBox(el) {
  const box = $('#fpsBox', el);
  if (!box) return;
  let st = await call('fps:status');
  if (st.installed && !st.running && !drawFpsBox.autoStarted) {
    drawFpsBox.autoStarted = true; // liga sozinha na primeira visita; depois respeita o botão
    if (await call('fps:start')) st = { ...st, running: true };
  }
  if (!st.installed) {
    box.innerHTML = `<div class="callout small">Para medir FPS, 1% low e frame time, o HS TECH usa o <b>PresentMon</b>, ferramenta gratuita e de código aberto da Intel (funciona com qualquer placa). Ele é baixado do GitHub oficial (GameTechDev/PresentMon), cerca de 5 MB.</div>
      <div class="row mt"><button class="btn primary" id="pmDl">${icon('download')}Baixar PresentMon</button><div class="progress hidden" id="pmProg" style="flex:1"><div></div></div></div>`;
    const offP = api.on('fps:download', (p) => { const bar = $('#pmProg div', el); if (bar) bar.style.width = `${Math.round(p * 100)}%`; });
    off.push(offP);
    $('#pmDl', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      $('#pmProg', el).classList.remove('hidden');
      const r = await call('fps:download');
      toast(`PresentMon ${r.version} instalado`, 'ok');
      await call('fps:start');
      drawFpsBox(el);
    }, 'Baixando…'));
    return;
  }
  box.innerHTML = `<div class="row"><span class="dot ${st.running ? 'ok' : 'warn'}"></span><span id="fpsState">${st.running ? 'Captura de FPS ligada: abra um jogo.' : 'Captura de FPS desligada.'}</span><span class="spacer"></span>
    <button class="btn sm" id="pmToggle">${st.running ? 'Parar Captura' : 'Iniciar Captura'}</button></div>`;
  $('#pmToggle', el).addEventListener('click', async () => { await call(st.running ? 'fps:stop' : 'fps:start'); drawFpsBox(el); });
}

function update(el, s) {
  if (!el.isConnected) return;
  push('cpu', s.cpu); push('ram', s.ram);
  push('gpu', s.gpu ? s.gpu.util : null);
  push('vram', s.gpu && s.gpu.vramTotal ? (s.gpu.vramUsed / s.gpu.vramTotal) * 100 : null);
  push('disk', s.disk ? s.disk.active : null);
  push('rx', s.net ? s.net.rx : 0); push('tx', s.net ? s.net.tx : 0);
  const set = (id, big, small, side) => { $(`#b-${id}`, el).textContent = big; $(`#s-${id}`, el).textContent = small || ''; $(`#v-${id}`, el).textContent = side || ''; };
  set('cpu', `${fmt(s.cpu)}%`, s.cpuClock ? `${fmt(s.cpuClock)} MHz` : '', `${navigator.hardwareConcurrency} threads`);
  if (s.gpu) set('gpu', `${fmt(s.gpu.util)}%`, [s.gpu.clock ? `${fmt(s.gpu.clock)} MHz` : '', s.gpu.temp != null && !Number.isNaN(s.gpu.temp) ? `${fmt(s.gpu.temp)}°C` : '', s.gpu.power ? `${fmt(s.gpu.power)} W` : ''].filter(Boolean).join(' · '), s.gpu.vramTotal ? `VRAM ${fmt(s.gpu.vramUsed / 1024, 1)} / ${fmt(s.gpu.vramTotal / 1024, 1)} GB` : '');
  set('ram', `${fmt(s.ram)}%`, `${fmtBytes(s.ramUsed)} em uso`, `${fmtBytes(s.ramTotal, 0)} no total`);
  if (s.disk) set('disk', `${fmt(s.disk.active)}%`, 'tempo ativo', `Leitura ${fmtBytes(s.disk.read)}/s · Escrita ${fmtBytes(s.disk.write)}/s`);
  drawLine($('#c-cpu', el), [H.cpu]);
  drawLine($('#c-gpu', el), [H.gpu, H.vram], { colors: ['primary', 'text-muted'] });
  drawLine($('#c-ram', el), [H.ram], { colors: ['primary'] });
  drawLine($('#c-disk', el), [H.disk], { colors: ['primary'] });
  const netMax = Math.max(1024 * 64, ...H.rx, ...H.tx) * 1.15;
  drawLine($('#c-net', el), [H.rx, H.tx], { max: netMax, colors: ['primary', 'text-muted'] });
  $('#v-net', el).textContent = s.net ? `↓ ${fmtBytes(s.net.rx)}/s · ↑ ${fmtBytes(s.net.tx)}/s` : '—';
  const f = s.fps || {};
  if (f.app) {
    $('#v-fps', el).textContent = `${f.app}: ${fmt(f.fps)} FPS · 1% low ${fmt(f.low1)} · ${fmt(f.frametime, 1)} ms`;
    const g = f.graph || [];
    drawLine($('#c-fps', el), [g], { max: Math.max(20, ...g) * 1.2, colors: ['primary'], fill: true });
  } else {
    $('#v-fps', el).textContent = f.running ? 'Aguardando um jogo…' : (f.error ? f.error : '—');
  }
}

export function unmount() { off.forEach((f) => f()); off = []; }
