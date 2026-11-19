import { api, call, fmt, fmtBytes, drawLine, $ } from '../ui.js';

let off = [];
const H = { cpu: [], gpu: [], ram: [], disk: [], vram: [], rx: [], tx: [] };
const MAXN = 120;
const push = (k, v) => { H[k].push(v); if (H[k].length > MAXN) H[k].shift(); };

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Monitor</h1><p>Desempenho em tempo real: CPU, GPU, memória, disco e rede.</p></div></div>
  <div class="grid g2">
    ${card('cpu', 'CPU', 'var(--ui-text-highlighted)')}${card('gpu', 'GPU', 'var(--ui-text-highlighted)')}${card('ram', 'Memória RAM', 'var(--ui-text-highlighted)')}${card('disk', 'Disco', 'var(--ui-text-highlighted)')}
  </div>
  <div class="card mt"><div class="row between"><h3 style="margin:0">Rede</h3><span class="small muted" id="v-net">—</span></div><canvas class="chart mt" id="c-net"></canvas>
    <div class="small muted"><span class="c-primary">●</span> download <span style="color:var(--ui-text-muted);margin-left:10px">●</span> upload</div></div>`;

  call('monitor:start');
  off.push(api.on('monitor:sample', (s) => update(el, s)));
}

function card(id, title, color) {
  return `<div class="card"><div class="row between"><h3 style="margin:0">${title}</h3><span class="small muted" id="v-${id}">—</span></div>
    <div class="row" style="align-items:flex-end;gap:6px"><span style="font-size:30px;font-weight:700;color:${color}" id="b-${id}">—</span><span class="muted" id="s-${id}"></span></div>
    <canvas class="chart" id="c-${id}"></canvas></div>`;
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
}

export function unmount() { off.forEach((f) => f()); off = []; }
