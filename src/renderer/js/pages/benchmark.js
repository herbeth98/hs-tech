import { api, call, esc, fmt, icon, busy, toast, modal, $ } from '../ui.js';
import { cpuSingle, cpuMulti, memory, createGpuTest } from '../perf.js';

// Referência = 1000 pontos por categoria: PC gamer intermediário
// (Ryzen 5 5600 / Core i5-12400F, RTX 3060, DDR4-3200 dual channel, SSD NVMe PCIe 3.0).
// Calibrado medindo um Ryzen 7 7800X3D + RTX 5060 Ti + DDR5-6000 e aplicando a diferença conhecida
// para o PC de referência (~1,25x CPU 1 núcleo, ~1,3x multi, ~1,4x GPU, ~1,6x RAM).
const REF = { single: 6490, multi: 34300, ram: 24, gpu: 508, diskRead: 2600, diskRand: 420, diskWrite: 1500 };
const WEIGHTS = { cpu1: 0.18, cpuN: 0.24, gpu: 0.32, ram: 0.1, disk: 0.16 };
const TIERS = [
  [0, 'Entrada', 'Bom para tarefas do dia a dia e jogos leves.'],
  [600, 'Intermediário', 'Roda a maioria dos jogos em 1080p com ajustes médios.'],
  [900, 'Gamer', 'Jogos atuais em 1080p alto com boa taxa de quadros.'],
  [1300, 'Avançado', 'Jogos em 1440p alto e e-sports com FPS muito alto.'],
  [1800, 'Entusiasta', 'Jogos em 1440p/4K no máximo, streaming e criação pesada.'],
  [2600, 'Topo de linha', 'Entre os PCs mais rápidos disponíveis.']
];
const tierOf = (s) => [...TIERS].reverse().find(([min]) => s >= min);

let running = false;
let gpuTest = null;

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Benchmark</h1><p>Testa CPU (um núcleo e todos), memória, placa de vídeo e disco, e monta uma pontuação. <b>1000 pontos</b> = um PC gamer intermediário (Ryzen 5 5600, RTX 3060, NVMe).</p></div>
    <div class="actions"><button class="btn primary" id="run">${icon('play')}Rodar Benchmark Completo</button></div></div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 380px;align-items:start">
    <div>
      <div class="card" id="result"><div class="empty">Feche jogos e programas pesados e clique em <b>Rodar benchmark completo</b>. Leva cerca de 2 minutos.</div></div>
      <div class="card mt"><h3>Teste de GPU</h3><div id="gpuView"><div class="empty small">A cena 3D aparece aqui durante o teste.</div></div><div class="small muted mt" id="gpuName"></div></div>
    </div>
    <div class="card"><h3>Progresso</h3><div class="list" id="steps"></div><div class="progress mt"><div id="bar"></div></div>
      <h3 class="mt2">Histórico</h3><div class="list" id="hist"></div></div>
  </div>`;
  drawSteps(el, {});
  drawHistory(el);
  $('#run', el).addEventListener('click', (e) => busy(e.currentTarget, () => runAll(el), 'Testando…'));
}

const STEPS = [['single', 'CPU: um núcleo'], ['multi', 'CPU: todos os núcleos'], ['ram', 'Memória RAM'], ['gpu', 'Placa de vídeo (3D)'], ['diskWrite', 'Disco: escrita'], ['diskRead', 'Disco: leitura']];
function drawSteps(el, st) {
  $('#steps', el).innerHTML = STEPS.map(([k, l]) => `<div class="item" style="padding:8px 2px"><span class="dot ${st[k] === 'done' ? 'ok' : st[k] === 'run' ? 'info' : ''}"></span><div class="grow">${l}</div><span class="small muted">${st[k + 'V'] || ''}</span></div>`).join('');
}

function computeScores(m) {
  const sc = {
    cpu1: (m.single / REF.single) * 1000,
    cpuN: (m.multi / REF.multi) * 1000,
    ram: (m.ram / REF.ram) * 1000,
    gpu: (m.gpu / REF.gpu) * 1000,
    disk: m.diskRead || m.diskWrite ? Math.exp((Math.log(Math.max(1, m.diskRead || m.diskWrite) / REF.diskRead) + Math.log(Math.max(1, m.diskRand || REF.diskRand * 0.5) / REF.diskRand) + Math.log(Math.max(1, m.diskWrite) / REF.diskWrite)) / 3) * 1000 : 0
  };
  let lt = 0, wt = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) if (sc[k] > 0) { lt += w * Math.log(sc[k]); wt += w; }
  const total = Math.round(Math.exp(lt / wt));
  Object.keys(sc).forEach((k) => { sc[k] = Math.round(sc[k]); });
  return { ...sc, total };
}

async function runAll(el) {
  if (running) return;
  running = true;
  const st = {};
  const m = {};
  const bar = $('#bar', el);
  const step = async (key, fn, fmtV, pct) => {
    st[key] = 'run'; drawSteps(el, st);
    const v = await fn();
    st[key] = 'done'; st[key + 'V'] = fmtV(v); drawSteps(el, st);
    bar.style.width = pct + '%';
    return v;
  };
  try {
    const info = await api.call('sys:info').catch(() => ({}));
    m.single = await step('single', () => cpuSingle(6000), (v) => `${fmt(v)} op/s`, 12);
    m.multi = await step('multi', () => cpuMulti(8000), (v) => `${fmt(v)} op/s`, 28);
    m.ram = await step('ram', () => memory(3000), (v) => `${fmt(v, 1)} GB/s`, 36);
    m.gpu = await step('gpu', async () => {
      gpuTest = createGpuTest($('#gpuView', el));
      $('#gpuName', el).textContent = `Renderizando em: ${gpuTest.renderer}`;
      m.gpuRenderer = gpuTest.renderer;
      const fps = await gpuTest.bench(12000, (f) => { st.gpuV = `${fmt(f)} FPS`; drawSteps(el, { ...st, gpu: 'run' }); });
      gpuTest.dispose(); gpuTest = null;
      return fps;
    }, (v) => `${fmt(v, 1)} FPS`, 60);
    m.diskWrite = await step('diskWrite', () => call('bench:diskWrite'), (v) => `${fmt(v)} MB/s`, 75);
    const rd = await step('diskRead', () => call('bench:diskRead', 'c').catch(() => ({})), (v) => (v.seqRead ? `${fmt(v.seqRead)} MB/s` : 'indisponível'), 100);
    m.diskRead = rd.seqRead; m.diskRand = rd.randRead;
    const scores = computeScores(m);
    const gpuName = ((info.gpus || []).find((g) => /NVIDIA|Radeon RX|Arc/i.test(g.name)) || (info.gpus || [])[0] || {}).name;
    const result = { id: Date.now().toString(36), date: new Date().toISOString(), host: info.host, cpuName: info.cpu, gpuName, ramTotal: info.ramTotal, measures: m, ...scores };
    await call('bench:save', result);
    showResult(el, result);
    drawHistory(el);
  } catch (e) {
    toast('Benchmark interrompido: ' + e.message, 'error', 8000);
  } finally {
    running = false;
    if (gpuTest) { gpuTest.dispose(); gpuTest = null; }
  }
}

function bar(label, v, sub) {
  const pct = Math.min(100, (v / 2600) * 100);
  return `<div class="mt"><div class="row between"><span>${label}</span><b>${fmt(v)}</b></div><div class="progress" style="height:10px"><div style="width:${pct}%"></div></div><div class="small muted">${sub}</div></div>`;
}

function showResult(el, r, prev) {
  const [, tier, desc] = tierOf(r.total);
  const m = r.measures || {};
  $('#result', el).innerHTML = `
    <div class="row" style="gap:28px;align-items:center">
      <div><div class="small muted">PONTUAÇÃO HS TECH</div><div class="score-big">${fmt(r.total)}</div><div class="badge violet mt">${tier}</div></div>
      <div class="grow" style="flex:1"><p style="margin:0">${desc}</p>
        <p class="small muted">${esc(r.cpuName || '')} · ${esc(r.gpuName || '')} · ${new Date(r.date).toLocaleString('pt-BR')}</p>
        <p class="small muted">${r.total >= 1000 ? `${fmt((r.total / 1000 - 1) * 100)}% mais rápido` : `${fmt((1 - r.total / 1000) * 100)}% mais lento`} que o PC de referência.</p></div>
    </div>
    ${bar('CPU: um núcleo', r.cpu1, `${fmt(m.single)} op/s · importa para jogos e-sports`)}
    ${bar('CPU: todos os núcleos', r.cpuN, `${fmt(m.multi)} op/s · renderização, streaming, compilação`)}
    ${bar('Placa de vídeo', r.gpu, `${fmt(m.gpu, 1)} FPS na cena 3D em 1920x1080`)}
    ${bar('Memória RAM', r.ram, `${fmt(m.ram, 1)} GB/s`)}
    ${bar('Disco', r.disk, `Leitura ${m.diskRead ? fmt(m.diskRead) + ' MB/s' : '—'} · aleatória ${m.diskRand ? fmt(m.diskRand) + ' MB/s' : '—'} · escrita ${fmt(m.diskWrite)} MB/s`)}
    <div class="row mt2"><button class="btn sm" id="export">${icon('download')}Exportar Resultado</button></div>`;
  $('#export', el).addEventListener('click', async () => {
    const txt = `HS TECH Benchmark\n${new Date(r.date).toLocaleString('pt-BR')}\n${r.cpuName}\n${r.gpuName}\n\nPontuação: ${r.total} (${tier})\nCPU 1 núcleo: ${r.cpu1}\nCPU todos: ${r.cpuN}\nGPU: ${r.gpu}\nRAM: ${r.ram}\nDisco: ${r.disk}\n\nMedidas: ${JSON.stringify(r.measures, null, 2)}\n`;
    const p = await call('dialog:saveFile', { name: `HS-TECH-benchmark-${r.total}.txt`, content: txt });
    if (p) toast('Resultado salvo', 'ok');
  });
}

async function drawHistory(el) {
  const h = await call('bench:history');
  const box = $('#hist', el);
  if (!box) return;
  if (!h.length) { box.innerHTML = '<div class="small muted">Nenhum resultado ainda.</div>'; return; }
  box.innerHTML = h.slice(0, 12).map((r) => `<div class="item" style="padding:8px 2px;cursor:pointer" data-id="${r.id}"><div class="grow"><b>${fmt(r.total)}</b> <span class="small muted">${tierOf(r.total)[1]}</span><div class="small muted">${new Date(r.date).toLocaleString('pt-BR')}</div></div><button class="btn sm ghost" data-del="${r.id}">✕</button></div>`).join('');
  box.querySelectorAll('[data-id]').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target.closest('[data-del]')) return;
    const r = h.find((x) => x.id === d.dataset.id);
    showResult(el, r);
  }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { await call('bench:delete', b.dataset.del); drawHistory(el); }));
  if (!running && h[0] && !$('#result .score-big', el)) showResult(el, h[0]);
}

export function unmount() { if (gpuTest) { gpuTest.stop(); } }
