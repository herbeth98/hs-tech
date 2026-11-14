import { api, call, esc, icon, toast, $ } from '../ui.js';

let off = [];
let mm = new Map();          // chave -> { min, max }
let collapsed = new Set();   // ids de dispositivo/grupo recolhidos
let structure = '';          // assinatura da árvore (para redesenhar só quando mudar)
let recording = null;        // { rows: [], header: [] } durante a gravação em CSV
let lastDevices = [];

const DEC = { '°C': 1, W: 1, GB: 2, MB: 0, 'MB/s': 2, 'KB/s': 1, MHz: 0, '%': 0 };
const fmtV = (v, unit) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: DEC[unit] ?? 0, maximumFractionDigits: DEC[unit] ?? 0 })} ${unit}`);
const keyOf = (d, g, s) => `${d.id}|${g.name}|${s.name}`;

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div class="row" style="gap:var(--space-4);align-items:flex-start">
      <span class="weekly-ic">${icon('activity')}</span>
      <div><h1>Hardware Monitor</h1><p>Temperaturas, clocks, energia, uso e ventoinhas ao vivo, com o mínimo e o máximo desde que a tela foi aberta. Lido direto do Windows e do driver da placa de vídeo, sem instalar nada.</p></div></div>
    <div class="actions">
      <button class="btn" id="fold">${icon('layers')}Recolher Tudo</button>
      <button class="btn" id="reset">${icon('refresh')}Zerar Mín./Máx.</button>
      <button class="btn primary" id="rec">${icon('download')}Gravar em CSV</button>
    </div></div>
  <div class="card hw-card"><div class="hw-scroll">
    <table class="tbl hw-tbl"><thead><tr><th>Sensor</th><th class="num">Valor</th><th class="num">Mínimo</th><th class="num">Máximo</th></tr></thead>
    <tbody id="hwBody"><tr><td colspan="4" class="muted" style="padding:var(--space-6)"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--ui-primary);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:8px"></span>Lendo os sensores…</td></tr></tbody></table>
  </div></div>
  <div class="small muted mt" id="hwFoot">—</div>
  <div class="small muted mt-1">A temperatura do processador AMD/Intel não é exposta pelo Windows: ler esse sensor exige um driver de baixo nível, que o HS TECH não instala. Temperaturas e ventoinhas da placa-mãe ficam no chip Super I/O e também não são lidas.</div>`;

  $('#hwBody', el).addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-fold]');
    if (!tr) return;
    const id = tr.dataset.fold;
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    applyFold(el);
  });
  $('#fold', el).addEventListener('click', () => {
    const all = lastDevices.map((d) => `d:${d.id}`);
    const anyOpen = all.some((id) => !collapsed.has(id));
    collapsed = new Set(anyOpen ? all : []);
    $('#fold', el).innerHTML = `${icon('layers')}${anyOpen ? 'Expandir Tudo' : 'Recolher Tudo'}`;
    applyFold(el);
  });
  $('#reset', el).addEventListener('click', () => { mm = new Map(); toast('Mínimos e máximos zerados', 'ok'); });
  $('#rec', el).addEventListener('click', () => toggleRec(el));

  off.push(api.on('hw:sample', (s) => onSample(el, s)));
  await call('hw:start');
}

function onSample(el, s) {
  const body = $('#hwBody', el);
  if (!body) return;
  lastDevices = s.devices;
  // Atualiza mínimo e máximo
  let count = 0;
  for (const d of s.devices) for (const g of d.groups) for (const x of g.sensors) {
    count++;
    if (x.value == null) continue;
    const k = keyOf(d, g, x);
    const m = mm.get(k);
    if (!m) mm.set(k, { min: x.value, max: x.value });
    else { if (x.value < m.min) m.min = x.value; if (x.value > m.max) m.max = x.value; }
  }
  const sig = s.devices.map((d) => d.id + ':' + d.groups.map((g) => g.name + g.sensors.length).join(',')).join('|');
  if (sig !== structure) { structure = sig; body.innerHTML = rows(s.devices); applyFold(el); }
  else updateCells(body, s.devices);
  $('#hwFoot', el).textContent = `${count} sensores · ${s.devices.length} dispositivos · atualiza a cada 1 s${recording ? ` · gravando (${recording.rows.length} linhas)` : ''}`;
  if (recording) record(s.devices);
}

function rows(devices) {
  let h = '';
  for (const d of devices) {
    h += `<tr class="hw-dev" data-fold="d:${esc(d.id)}"><td colspan="4"><span class="caret">${icon('play')}</span><span class="hw-ic">${icon(d.icon || 'chip')}</span>${esc(d.name)}</td></tr>`;
    for (const g of d.groups) {
      const gid = `g:${d.id}|${g.name}`;
      h += `<tr class="hw-grp" data-parent="d:${esc(d.id)}" data-fold="${esc(gid)}"><td colspan="4"><span class="caret">${icon('play')}</span>${esc(g.name)}${g.note ? `<span class="hw-note" title="${esc(g.note)}">${icon('info')}</span>` : ''}</td></tr>`;
      for (const x of g.sensors) {
        const k = keyOf(d, g, x);
        h += `<tr class="hw-s" data-parent="d:${esc(d.id)}" data-gparent="${esc(gid)}" data-k="${esc(k)}" data-unit="${esc(x.unit)}">
          <td>${esc(x.name)}</td><td class="num v">${x.value == null ? '<span class="muted" title="' + esc(g.note || 'Sensor indisponível') + '">indisponível</span>' : fmtV(x.value, x.unit)}</td><td class="num mn">—</td><td class="num mx">—</td></tr>`;
      }
    }
  }
  return h;
}

function updateCells(body, devices) {
  const map = new Map();
  for (const d of devices) for (const g of d.groups) for (const x of g.sensors) map.set(keyOf(d, g, x), x);
  body.querySelectorAll('tr.hw-s').forEach((tr) => {
    const x = map.get(tr.dataset.k);
    if (!x || x.value == null) return;
    const u = tr.dataset.unit;
    const m = mm.get(tr.dataset.k);
    const v = tr.querySelector('.v');
    const txt = fmtV(x.value, u);
    if (v.textContent !== txt) { v.textContent = txt; v.classList.remove('tick'); void v.offsetWidth; v.classList.add('tick'); }
    if (m) { tr.querySelector('.mn').textContent = fmtV(m.min, u); tr.querySelector('.mx').textContent = fmtV(m.max, u); }
    // Temperaturas altas em destaque
    if (u === '°C') v.dataset.heat = x.value >= 85 ? 'bad' : x.value >= 70 ? 'warn' : '';
  });
}

function applyFold(el) {
  const body = $('#hwBody', el);
  body.querySelectorAll('tr[data-fold]').forEach((tr) => tr.classList.toggle('folded', collapsed.has(tr.dataset.fold)));
  body.querySelectorAll('tr[data-parent]').forEach((tr) => {
    // Boolean(): com "undefined", classList.toggle inverte a classe em vez de removê-la
    const hide = Boolean(collapsed.has(tr.dataset.parent) || (tr.dataset.gparent && collapsed.has(tr.dataset.gparent)));
    tr.classList.toggle('hidden', hide);
  });
}

// ---------------- Gravação em CSV ----------------
function toggleRec(el) {
  const btn = $('#rec', el);
  if (!recording) {
    recording = { header: null, rows: [] };
    btn.classList.add('danger'); btn.classList.remove('primary');
    btn.innerHTML = `${icon('stop')}Parar e Salvar CSV`;
    toast('Gravando os sensores a cada segundo', 'info');
    return;
  }
  const rec = recording; recording = null;
  btn.classList.remove('danger'); btn.classList.add('primary');
  btn.innerHTML = `${icon('download')}Gravar em CSV`;
  if (!rec.rows.length) { toast('Nada foi gravado: espere pelo menos 1 segundo antes de parar', 'warn'); return; }
  const csv = [rec.header.join(';'), ...rec.rows.map((r) => r.join(';'))].join('\r\n');
  call('dialog:saveFile', { name: `HS-TECH-sensores-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`, content: '﻿' + csv })
    .then((p) => { if (p) toast(`${rec.rows.length} leituras salvas em CSV`, 'ok'); });
}

function record(devices) {
  const cols = []; const vals = [];
  for (const d of devices) for (const g of d.groups) for (const x of g.sensors) {
    cols.push(`${d.name} / ${g.name} / ${x.name} (${x.unit})`);
    vals.push(x.value == null ? '' : String(x.value).replace('.', ','));
  }
  if (!recording.header) recording.header = ['Hora', ...cols];
  recording.rows.push([new Date().toLocaleTimeString('pt-BR'), ...vals]);
}

export function unmount() {
  off.forEach((f) => f()); off = [];
  api.call('hw:stop').catch(() => {});
  structure = '';
  recording = null;
}
