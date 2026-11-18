import { api, call, esc, fmtBytes, fmt, gaugeSvg, updateGauge, icon, navigate, busy, toast, drawLine, token, $ } from '../ui.js';
import { runFullOptimization } from '../fullopt.js';

let off = [];
let timers = [];
const HIST = 60;
const hist = { cpu: [], gpu: [], ram: [], disk: [], net: [] };
let tab = 'cpu';
let info = null;
const TABS = [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'RAM'], ['disk', 'Disco'], ['net', 'Rede']];

export async function render(el) {
  const user = (await api.call('app:info').catch(() => ({}))).userName;
  el.innerHTML = `
  <div class="page-head dash-head">
    <div><h1>Olá${user ? `, <span class="c-primary">${esc(user)}</span>` : ''}!</h1><p>O estado do seu PC e as ações mais usadas, num só lugar.</p></div>
    <div class="actions"><div class="pending" id="pending"><span class="spin" aria-hidden="true"></span><div><b>Verificando…</b><span>ajustes recomendados</span></div></div></div>
  </div>

  <div class="dash-top">
    <div class="dash-col">
      <div class="card mini" id="cRestore">
        <div class="mini-ic">${icon('restore')}</div>
        <div class="mini-body"><span class="label">Pontos de restauração</span><b class="mini-val" id="rpCount">—</b><span class="small muted" id="rpLast">Lendo…</span></div>
        <button class="btn sm" id="rpBtn">${icon('plus')}Criar Ponto</button>
      </div>
      <div class="card mini" id="cClean">
        <div class="mini-ic">${icon('broom')}</div>
        <div class="mini-body"><span class="label">Arquivos para limpar</span><b class="mini-val" id="clVal">—</b><span class="small muted" id="clSub">Calculando…</span></div>
        <button class="btn sm" id="clBtn">${icon('trash')}Limpar Arquivos</button>
      </div>
      <div class="card mini" id="cRam">
        <div class="mini-ic">${icon('chip')}</div>
        <div class="mini-body"><span class="label">Memória RAM</span><b class="mini-val" id="ramVal">—</b><span class="small muted" id="ramSub">—</span>
          <div class="progress mt-1"><div id="ramBar"></div></div></div>
        <button class="btn sm" id="ramBtn">${icon('sparkle')}Limpar Memória</button>
      </div>
    </div>

    <div class="card score-card glow-card">
      <div class="label center">Pontuação de Otimização</div>
      <div class="speedo" id="speedo">${speedoSvg()}<div class="speedo-val"><b id="scoreVal">0</b><span>%</span></div></div>
      <div class="center small muted" id="scoreSub">Lendo os ajustes do Windows…</div>
      <div class="row center-row mt">
        <button class="btn primary lg boost-btn" id="boost"><span class="shine" aria-hidden="true"></span>${icon('rocket')}Dar Boost Agora</button>
        <button class="btn ghost sm" data-go="otimizacao">Ver Ajustes</button>
      </div>
    </div>

    <div class="card promo glow-card">
      <div class="promo-art" aria-hidden="true"><div class="chip-core">${icon('sparkle')}</div></div>
      <span class="badge violet">Novo</span>
      <h2>Configurar Windows Recém-Formatado</h2>
      <p class="muted">Acabou de formatar? Deixe tudo pronto de uma vez, numa tela só.</p>
      <ul class="checks"><li>${icon('ok')}Apps escolhidos instalados em um clique</li><li>${icon('ok')}Boost e Debloat completos</li><li>${icon('ok')}Privacidade e IA da Microsoft resolvidas</li></ul>
      <button class="btn primary block" data-go="windows-novo">${icon('sparkle')}Começar Configuração</button>
    </div>
  </div>

  <div class="card mt monitor glow-card">
    <div class="row between">
      <div><h3 style="margin:0">Monitor de Desempenho em Tempo Real</h3><div class="small muted" id="cpuName">—</div></div>
      <div class="seg" role="tablist" id="seg">${TABS.map(([k, l]) => `<button role="tab" data-k="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="monitor-body">
      <div class="gauge ring" id="ring">${gaugeSvg(0, null, 108, 10)}<div class="gv"><b id="ringVal">—</b><span id="ringLbl">CPU</span></div></div>
      <div class="chart-wrap"><canvas class="chart" id="chart" style="height:150px"></canvas><div class="chart-x"><span>60 s</span><span>45 s</span><span>30 s</span><span>15 s</span><span>agora</span></div></div>
    </div>
    <div class="grid g4 mt">
      <div class="tile"><span class="tile-ic">${icon('gauge')}</span><div><b id="tClock">—</b><span>Clock atual</span></div></div>
      <div class="tile"><span class="tile-ic">${icon('chip')}</span><div><b id="tCores">—</b><span>Núcleos / Threads</span></div></div>
      <div class="tile"><span class="tile-ic">${icon('layers')}</span><div><b id="tRam">—</b><span>Memória RAM</span></div></div>
      <div class="tile"><span class="tile-ic">${icon('gpu')}</span><div><b id="tGpu">—</b><span>Carga da GPU</span></div></div>
    </div>
  </div>

  <div class="grid dash-bottom mt">
    <div class="card"><div class="row between"><h3 style="margin:0">Ações Recomendadas</h3><button class="btn sm ghost" data-go="otimizacao">Ver Todas</button></div>
      <div class="small muted mb">Ajustes recomendados que ainda estão desligados no seu PC.</div>
      <div class="list" id="recs"><div class="empty">Lendo…</div></div></div>
    <div class="card"><h3>Informações do Sistema</h3><div class="sysinfo" id="sys"><div class="muted">Lendo o hardware…</div></div></div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
  $('#seg', el).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    tab = b.dataset.k;
    el.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('active', x === b));
    drawMonitor(el, last);
  });

  // Ações rápidas
  $('#rpBtn', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const ok = await call('restore:create', 'HS TECH - Painel');
    if (!ok) { toast('O Windows não criou o ponto de restauração. Ative a Proteção do Sistema no disco C: (página Reparo) e tente de novo', 'error', 9000); return false; }
    toast('Ponto de restauração criado', 'ok');
    loadRestore(el);
  }, 'Criando…'));
  $('#clBtn', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('clean:run', 'safe');
    toast(`${fmtBytes(r.freed)} liberados`, 'ok');
    loadClean(el);
  }, 'Limpando…'));
  $('#ramBtn', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('mem:clean');
    toast(`Memória RAM: ${fmt(r.freedMB / 1024, 1)} GB liberados`, 'ok');
  }, 'Limpando…'));
  $('#boost', el).addEventListener('click', (e) => boost(el, e.currentTarget));

  // Dados
  call('monitor:start');
  off.push(api.on('monitor:sample', (s) => onSample(el, s)));
  loadScore(el);
  loadRestore(el);
  loadClean(el);
  loadSystem(el);
}

// ---------------- Acelerador ----------------
const CX = 130, CY = 132, R = 104, START = 150, SWEEP = 240;
const LEN = R * (SWEEP * Math.PI / 180);
const pt = (deg, r = R) => [CX + r * Math.cos(deg * Math.PI / 180), CY + r * Math.sin(deg * Math.PI / 180)];

function speedoSvg() {
  const [sx, sy] = pt(START); const [ex, ey] = pt(START + SWEEP);
  const arc = `M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`;
  let ticks = '';
  for (let v = 0; v <= 100; v += 5) {
    const a = START + v * SWEEP / 100;
    const big = v % 20 === 0;
    const [x1, y1] = pt(a, R - 16); const [x2, y2] = pt(a, R - (big ? 28 : 22));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="tick ${big ? 'big' : ''}"/>`;
    if (big) { const [tx, ty] = pt(a, R - 42); ticks += `<text x="${tx}" y="${ty + 4}" class="tick-l">${v}</text>`; }
  }
  return `<svg viewBox="0 0 260 200" aria-hidden="true">
    <path d="${arc}" class="speedo-track"/>
    <path d="${arc}" class="speedo-arc" id="speedoArc" stroke-dasharray="${LEN}" stroke-dashoffset="${LEN}"/>
    ${ticks}
    <g class="needle" id="needle" style="transform: rotate(${START}deg)"><line x1="${CX + R - 46}" y1="${CY}" x2="${CX + R - 20}" y2="${CY}"/><circle class="needle-dot" cx="${CX + R}" cy="${CY}" r="8"/></g>
  </svg>`;
}

function setScore(el, pct) {
  const arc = $('#speedoArc', el);
  const needle = $('#needle', el);
  if (!arc) return;
  const zone = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
  $('#speedo', el).dataset.zone = zone;
  arc.setAttribute('stroke-dashoffset', String(LEN * (1 - pct / 100)));
  needle.style.transform = `rotate(${START + SWEEP * pct / 100}deg)`;
  // Número sobe junto com o ponteiro
  const valEl = $('#scoreVal', el);
  const from = Number(valEl.textContent) || 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    const e = 1 - Math.pow(1 - k, 3);
    valEl.textContent = String(Math.round(from + (pct - from) * e));
    if (k < 1 && valEl.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let tweaksCache = [];
async function loadScore(el) {
  const st = await call('tweaks:status').catch(() => null);
  if (!st || !el.isConnected) return;
  tweaksCache = st;
  const rec = st.filter((t) => t.recommended);
  const on = rec.filter((t) => t.active === true).length;
  const pct = rec.length ? Math.round((on / rec.length) * 100) : 100;
  setScore(el, pct);
  const missing = rec.filter((t) => t.active !== true);
  $('#scoreSub', el).textContent = `${on} de ${rec.length} ajustes recomendados ativos`;
  const p = $('#pending', el);
  p.className = `pending ${missing.length ? 'warn' : 'ok'}`;
  p.innerHTML = missing.length
    ? `<span class="pend-ic">${icon('alert')}</span><div><b>Otimização Pendente</b><span>${missing.length} ajuste(s) desligado(s)</span></div>`
    : `<span class="pend-ic">${icon('ok')}</span><div><b>Tudo Otimizado</b><span>todos os recomendados ativos</span></div>`;
  drawRecs(el, missing);
}

function drawRecs(el, missing) {
  const box = $('#recs', el);
  if (!box) return;
  if (!missing.length) { box.innerHTML = `<div class="all-good"><span class="all-good-ic">${icon('ok')}</span><div><b>Tudo em dia</b><div class="small muted">Nenhum ajuste recomendado pendente. Rode o Check-up de vez em quando para conferir o PC.</div></div><button class="btn sm" data-go2="checkup">Abrir Check-up</button></div>`; box.querySelector('[data-go2]').addEventListener('click', () => navigate('checkup')); return; }
  box.innerHTML = missing.slice(0, 6).map((t) => `
    <div class="item rec"><span class="rec-ic">${icon(t.groupIcon || 'bolt')}</span>
      <div class="grow"><div class="title">${esc(t.title)}</div><div class="desc ellipsis" title="${esc(t.desc)}">${esc(t.desc)}</div></div>
      <span class="badge">${esc(t.group)}</span>
      <button class="btn sm primary" data-apply="${t.id}">Aplicar</button></div>`).join('');
  box.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await call('tweaks:set', b.dataset.apply, true);
    const t = tweaksCache.find((x) => x.id === b.dataset.apply);
    toast(`${t ? t.title : 'Ajuste'} aplicado`, 'ok');
    setTimeout(() => loadScore(el), 900);
  }, 'Aplicando…')));
}

// ---------------- Boost ----------------
function askRestore() {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>Criar um ponto de restauração antes do Boost?</h3>
      <div class="body"><p>Com ele, você pode voltar o Windows para como está agora, se precisar. Leva um ou dois minutos.</p>
      <p class="muted small">Mesmo sem o ponto, cada ajuste do Boost pode ser desfeito na página Otimização.</p></div>
      <div class="foot"><button class="btn ghost" data-r="cancel">Cancelar</button><button class="btn" data-r="no">Não, Continuar Sem</button><button class="btn primary" data-r="yes">Sim, Criar Ponto</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (!r && e.target !== bg) return;
      const v = r ? r.dataset.r : 'cancel';
      bg.classList.add('closing'); setTimeout(() => bg.remove(), 170);
      resolve(v);
    });
  });
}

async function boost(el, btn) {
  const ans = await askRestore();
  if (ans === 'cancel') return;
  const steps = ['perf', 'games', 'input', 'fps', 'privacy', 'ai', 'clean'];
  if (ans === 'yes') steps.unshift('restore');
  await runFullOptimization(btn, steps, async () => {
    try { const r = await api.call('mem:clean'); toast(`Boost concluído · ${fmt(r.freedMB / 1024, 1)} GB de RAM liberados`, 'ok', 6000); } catch {}
    if (el.isConnected) { loadScore(el); loadClean(el); loadRestore(el); }
  }, true);
}

// ---------------- Caixas ----------------
async function loadRestore(el) {
  const pts = await api.call('restore:list').catch(() => []);
  if (!el.isConnected) return;
  $('#rpCount', el).textContent = String(pts.length);
  $('#rpLast', el).textContent = pts[0] ? `Último: ${new Date(pts[0].date).toLocaleDateString('pt-BR')}` : 'Nenhum ponto criado';
}

async function loadClean(el) {
  $('#clSub', el).textContent = 'Calculando…';
  const cats = await api.call('clean:scan').catch(() => null);
  if (!cats || !el.isConnected) return;
  const total = cats.filter((c) => c.checked).reduce((a, c) => a + c.bytes, 0);
  $('#clVal', el).textContent = fmtBytes(total);
  $('#clSub', el).textContent = 'Temporários, cache de atualizações e logs';
}

async function loadSystem(el) {
  info = await api.call('sys:info').catch(() => null);
  const extra = await api.call('sys:extra').catch(() => ({}));
  const box = $('#sys', el);
  if (!info || !box) return;
  const gpus = [...(info.gpus || [])].sort((a, b) => (/NVIDIA|Radeon RX|Arc/i.test(b.name) ? 1 : 0) - (/NVIDIA|Radeon RX|Arc/i.test(a.name) ? 1 : 0)).map((g) => `${g.name}${g.vram ? ` (${fmtBytes(g.vram, 0)})` : ''}`);
  const ramSpeed = (info.memory || [])[0] ? ((info.memory[0].conf || info.memory[0].speed) + ' MT/s') : '';
  const disks = (info.disks || []).filter((d) => d.size > 0).slice(0, 4).map((d) => `${d.name} (${fmtBytes(d.size, 0)}, ${d.media === 'HDD' ? 'HD' : d.media})`);
  const up = (Date.now() - new Date(info.bootTime).getTime()) / 1000;
  const upTxt = up > 86400 ? `${Math.floor(up / 86400)} d ${Math.floor((up % 86400) / 3600)} h` : `${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} min`;
  const rows = [
    ['monitor', 'Computador', info.host],
    ['layers', 'Sistema', `${info.os} ${info.version} (build ${info.build})`],
    ['chip', 'Processador', info.cpu],
    ['activity', 'Núcleos', `${info.cores} físicos · ${info.threads} lógicos`],
    ['box', 'Memória RAM', `${fmtBytes(info.ramTotal, 0)}${ramSpeed ? ` · ${ramSpeed}` : ''}`],
    ['power', 'Ligado há', upTxt],
    ['gpu', 'Placa de vídeo', gpus.join(' · ')],
    ['dashboard', 'Placa-mãe', info.board],
    ['folder', 'Discos', disks.join(' · ')],
    ['shield', 'Secure Boot', extra.secureBoot === true ? `Ativado (${extra.firmware || 'UEFI'})` : extra.secureBoot === false ? 'Desativado' : 'Não suportado'],
    ['shield', 'TPM', extra.tpm ? `TPM ${extra.tpmVersion || ''}${extra.tpmReady ? ' · pronto' : ''}` : 'Não encontrado']
  ];
  box.innerHTML = rows.map(([ic, k, v]) => `<div class="si-row"><span class="si-ic">${icon(ic)}</span><span class="si-k">${esc(k)}</span><span class="si-v" title="${esc(v)}">${esc(v || '—')}</span></div>`).join('');
  $('#cpuName', el).textContent = info.cpu;
  $('#tCores', el).textContent = `${info.cores} / ${info.threads}`;
}

// ---------------- Monitor ----------------
let last = null;
const push = (k, v) => { hist[k].push(v); if (hist[k].length > HIST) hist[k].shift(); };

function onSample(el, s) {
  if (!el.isConnected) return;
  last = s;
  push('cpu', s.cpu);
  push('gpu', s.gpu ? s.gpu.util : 0);
  push('ram', s.ram);
  push('disk', s.disk ? s.disk.active : 0);
  push('net', s.net ? s.net.rx + s.net.tx : 0);
  $('#ramVal', el).textContent = `${fmt(s.ram)}%`;
  $('#ramSub', el).textContent = `${fmtBytes(s.ramUsed)} de ${fmtBytes(s.ramTotal, 0)} em uso`;
  $('#ramBar', el).style.width = `${Math.min(100, s.ram)}%`;
  $('#tClock', el).textContent = s.cpuClock ? `${fmt(s.cpuClock / 1000, 2)} GHz` : '—';
  $('#tRam', el).textContent = `${fmtBytes(s.ramUsed)} / ${fmtBytes(s.ramTotal, 0)}`;
  $('#tGpu', el).textContent = s.gpu ? `${fmt(s.gpu.util)}%${s.gpu.temp != null && !Number.isNaN(s.gpu.temp) ? ` · ${fmt(s.gpu.temp)}°C` : ''}` : '—';
  drawMonitor(el, s);
}

function drawMonitor(el, s) {
  if (!s) return;
  const data = hist[tab];
  const isNet = tab === 'net';
  const max = isNet ? Math.max(1024 * 64, ...data) * 1.15 : 100;
  drawLine($('#chart', el), [data], { max, colors: ['primary'] });
  const cur = data[data.length - 1] || 0;
  const pct = isNet ? (cur / max) * 100 : cur;
  updateGauge($('#ring', el), pct);
  $('#ringVal', el).textContent = isNet ? `${fmtBytes(cur, 0)}/s` : `${fmt(cur)}%`;
  $('#ringLbl', el).textContent = TABS.find(([k]) => k === tab)[1];
}

export function unmount() { off.forEach((f) => f()); off = []; timers.forEach(clearTimeout); timers = []; }
