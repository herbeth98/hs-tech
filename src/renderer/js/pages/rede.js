import { api, call, esc, fmt, icon, busy, drawLine, gaugeSvg, updateGauge, toast, $ } from '../ui.js';

let off = [];
const HOSTS = [
  ['1.1.1.1', 'Cloudflare (1.1.1.1)'], ['8.8.8.8', 'Google (8.8.8.8)'], ['9.9.9.9', 'Quad9 (9.9.9.9)'],
  ['208.67.222.222', 'OpenDNS (208.67.222.222)'], ['custom', 'Outro endereço (ex.: IP do servidor do jogo)...']
];

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Rede</h1><p>Teste de velocidade, ping, jitter e perda de pacotes.</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>Teste de Velocidade</h3><div class="sub">Servidor da Cloudflare mais próximo. Feche downloads e streams antes.</div>
      <div class="row" style="gap:26px;justify-content:center">
        <div class="gauge" style="width:170px;height:170px" id="sg">${gaugeSvg(0, 'url(#gg)', 170, 12)}<div class="gv"><b id="sv" style="font-size:32px">—</b><span id="sp">Mbps</span></div></div>
        <div class="kv" style="grid-template-columns:120px 1fr;font-size:15px">
          <div title="Tempo de resposta do servidor de teste por HTTP. Para o ping de jogo, use o teste ao lado.">Latência (HTTP)</div><div id="r-ping">—</div><div>Jitter</div><div id="r-jit">—</div>
          <div>Download</div><div id="r-down">—</div><div>Upload</div><div id="r-up">—</div></div>
      </div>
      <div class="row mt"><button class="btn primary" id="speed">${icon('gauge')}Iniciar Teste</button><span class="small muted" id="speedNote"></span></div>
    </div>
    <div class="card"><h3>Ping e Perda de Pacotes</h3><div class="sub">Um ping por segundo. Deixe rodando enquanto joga para ver se a conexão oscila.</div>
      <div class="row"><select id="host" style="flex:1">${HOSTS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
        <input type="text" id="custom" class="hidden" placeholder="ex.: servidor do jogo" style="flex:1"><button class="btn primary" id="ping">${icon('play')}Iniciar Teste</button></div>
      <div class="grid g4 mt">
        <div class="stat"><span class="label">Ping</span><span class="value" id="p-last">—</span></div>
        <div class="stat"><span class="label">Média</span><span class="value" id="p-avg">—</span></div>
        <div class="stat"><span class="label">Jitter</span><span class="value" id="p-jit">—</span></div>
        <div class="stat"><span class="label">Perda</span><span class="value" id="p-loss">—</span></div>
      </div>
      <canvas class="chart mt" id="pc"></canvas>
      <div class="small muted" id="p-sum"></div>
    </div>
  </div>
  <div class="card mt"><h3>Como Ler</h3><div class="grid g3 small">
    <div><b>Ping</b>: até 30 ms é ótimo para jogos competitivos; acima de 80 ms já se nota.</div>
    <div><b>Jitter</b>: variação entre um ping e outro. Acima de 10 ms causa "teleporte". Wi-Fi costuma ter jitter alto: cabo resolve.</div>
    <div><b>Perda</b>: qualquer valor acima de 0% causa travadas. Se aparece só no Wi-Fi, é o sinal; se aparece no cabo, fale com o provedor.</div>
  </div></div>`;

  const s = await call('app:settings');
  if (s.lastSpeed) showSpeed(el, s.lastSpeed, true);

  $('#host', el).addEventListener('change', (e) => $('#custom', el).classList.toggle('hidden', e.target.value !== 'custom'));
  let running = false;
  const pingBtn = $('#ping', el);
  pingBtn.addEventListener('click', async () => {
    if (running) { await call('ping:stop'); running = false; pingBtn.innerHTML = `${icon('play')}Iniciar Ping`; return; }
    let host = $('#host', el).value;
    if (host === 'custom') host = $('#custom', el).value.trim();
    if (!host || !/^[\w.-]+$/.test(host)) { toast('Digite um endereço válido', 'warn'); return; }
    await call('ping:start', host);
    running = true; pingBtn.innerHTML = `${icon('stop')}Parar Ping`;
  });
  const cur = await call('ping:stats');
  if (cur) { running = true; pingBtn.innerHTML = `${icon('stop')}Parar Ping`; updatePing(el, cur); }
  off.push(api.on('ping:sample', (st) => updatePing(el, st)));

  $('#speed', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    ['r-ping', 'r-jit', 'r-down', 'r-up'].forEach((id) => { $('#' + id, el).textContent = '—'; });
    $('#speedNote', el).textContent = 'Testando…';
    const r = await call('speed:run');
    showSpeed(el, r);
    $('#speedNote', el).textContent = `Concluído às ${new Date(r.date).toLocaleTimeString('pt-BR')}`;
  }, 'Testando…'));
  off.push(api.on('speed:progress', (p) => {
    if (!el.isConnected) return;
    if (p.phase === 'ping' && p.done) { $('#r-ping', el).textContent = `${fmt(p.ping)} ms`; $('#r-jit', el).textContent = `${fmt(p.jitter, 1)} ms`; }
    if (p.phase === 'download' || p.phase === 'upload') {
      setGauge(el, p.mbps, p.phase === 'download' ? 'Download' : 'Upload');
      if (p.done) $(p.phase === 'download' ? '#r-down' : '#r-up', el).textContent = `${fmt(p.mbps, 1)} Mbps`;
    }
  }));
}

function setGauge(el, mbps, label) {
  const g = $('#sg', el);
  if (!g) return;
  const pct = Math.min(100, (Math.log10(Math.max(1, mbps)) / 3) * 100); // escala log até 1000 Mbps
  if (!updateGauge(g, pct)) g.querySelector('svg').outerHTML = gaugeSvg(pct, 'url(#gg)', 170, 12);
  $('#sv', el).textContent = fmt(mbps, mbps < 100 ? 1 : 0);
  $('#sp', el).textContent = `Mbps · ${label}`;
}

function showSpeed(el, r, old) {
  $('#r-ping', el).textContent = `${fmt(r.ping)} ms`;
  $('#r-jit', el).textContent = `${fmt(r.jitter, 1)} ms`;
  $('#r-down', el).textContent = `${fmt(r.download, 1)} Mbps`;
  $('#r-up', el).textContent = `${fmt(r.upload, 1)} Mbps`;
  setGauge(el, r.download, 'Download');
  if (old) $('#speedNote', el).textContent = `Último teste: ${new Date(r.date).toLocaleString('pt-BR')}`;
}

function updatePing(el, st) {
  if (!el.isConnected) return;
  $('#p-last', el).innerHTML = st.last == null ? '<span style="color:var(--ui-error)">perdido</span>' : `${fmt(st.last)}<small>ms</small>`;
  $('#p-avg', el).innerHTML = `${fmt(st.avg)}<small>ms</small>`;
  $('#p-jit', el).innerHTML = `${fmt(st.jitter, 1)}<small>ms</small>`;
  $('#p-loss', el).innerHTML = `<span style="color:${st.lossPct > 2 ? 'var(--ui-error)' : st.lossPct > 0 ? 'var(--ui-warning)' : 'var(--ui-success)'}">${fmt(st.lossPct, 1)}%</span>`;
  const hist = st.history.map((v) => (v == null ? null : v));
  const max = Math.max(30, ...hist.filter((v) => v != null)) * 1.2;
  drawLine($('#pc', el), [hist.map((v) => (v == null ? max : v))], { max, colors: ['primary'] });
  $('#p-sum', el).textContent = `${esc(st.host)} · ${st.sent} enviados · ${st.lost} perdidos (${fmt(st.totalLossPct, 2)}% no total) · mín ${fmt(st.min)} / máx ${fmt(st.max)} ms`;
}

export function unmount() { off.forEach((f) => f()); off = []; }
