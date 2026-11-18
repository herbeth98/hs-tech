// Utilitários da interface.
export const api = window.hs;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtBytes(b, d = 1) {
  if (b == null || Number.isNaN(b)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (Math.abs(b) >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i === 0 ? 0 : d)} ${u[i]}`;
}
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

// Registro de sinais de feedback (avisos e cancelamentos) para o busy() saber se a ação foi concluída de fato.
const feedbackLog = [];
const markFeedback = (type) => { feedbackLog.push(type); if (feedbackLog.length > 200) feedbackLog.splice(0, 100); };

const TOAST_META = {
  ok: ['ok', 'Concluído'], error: ['x', 'Erro'], warn: ['alert', 'Atenção'], info: ['info', 'Aviso']
};

export function toast(msg, type = 'info', ms = 4200) {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  if (type === 'warn' || type === 'error') markFeedback(type);
  const [ic, label] = TOAST_META[type] || TOAST_META.info;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icon(ic)}</span><div class="toast-body"><div class="toast-title">${label}</div><div class="toast-msg"></div></div>
    <button class="toast-close" aria-label="Fechar aviso">${icon('x')}</button><span class="toast-bar" style="animation-duration:${ms}ms"></span>`;
  t.querySelector('.toast-msg').textContent = msg;
  const close = () => {
    if (!t.isConnected || t.classList.contains('leaving')) return;
    t.style.height = `${t.offsetHeight}px`; // fixa a altura atual para poder animar até 0
    requestAnimationFrame(() => t.classList.add('leaving'));
    setTimeout(() => t.remove(), 260);
  };
  t.querySelector('.toast-close').addEventListener('click', close);
  box.appendChild(t);
  setTimeout(close, ms);
}

/** Lê um token de cor do tema (ex.: token('primary') -> valor de --ui-primary). */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--ui-${name}`).trim();
}

/** Erro = o que aconteceu + o que fazer em seguida. */
export function errorText(message) {
  const what = String(message || 'Erro desconhecido').replace(/\.\s*$/, '');
  return `Não deu certo: ${what}. Tente de novo; se continuar, reabra o HS TECH como administrador`;
}

export async function call(channel, ...args) {
  try { return await api.call(channel, ...args); } catch (e) { toast(errorText(e.message), 'error', 8000); throw e; }
}

export function modal({ title, body, okText = 'Confirmar Ação', cancelText = 'Cancelar', danger = false, wide = false }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" style="${wide ? 'width:min(760px,94vw)' : ''}"><h3>${esc(title)}</h3><div class="body">${body}</div>
      <div class="foot">${cancelText ? `<button class="btn ghost" data-r="0">${esc(cancelText)}</button>` : ''}<button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okText)}</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (r || e.target === bg) { const ok = r ? r.dataset.r === '1' : false; if (!ok) markFeedback('cancel'); const root = bg.querySelector('.body'); bg.classList.add('closing'); bg.style.pointerEvents = 'none'; setTimeout(() => bg.remove(), 170); resolve(ok ? root : false); }
    });
  });
}

const MIN_BUSY_MS = 400;     // spinner visível por pelo menos 0,4 s (evita "piscar")
const DONE_MS = 1800;        // tempo do estado "Concluído"
const FAIL_MS = 2400;        // tempo do estado "Não Concluído"

/**
 * Feedback em duas etapas para botões com ação demorada:
 * 1) na hora: spinner + texto de andamento; 2) ao terminar: "Concluído" ou "Não Concluído" no próprio botão.
 * Se a ação for cancelada (diálogo) ou terminar com aviso, o botão só volta ao normal.
 */
export async function busy(btn, fn, label) {
  if (!btn) return fn();
  if (btn._fbTimer) { clearTimeout(btn._fbTimer); btn._fbRestore && btn._fbRestore(); }
  const clone = btn.cloneNode(true);
  clone.querySelectorAll('.press-ripple').forEach((n) => n.remove());
  const html = clone.innerHTML;
  const cls = [...btn.classList].filter((c) => !c.startsWith('state-'));
  btn.style.minWidth = `${btn.offsetWidth}px`;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('state-busy');
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${label ? esc(label.replace(/\.\.\.$/, '…')) : html.replace(/<svg[\s\S]*?<\/svg>/, '')}`;
  const mark = feedbackLog.length;
  const t0 = performance.now();
  const restore = () => {
    btn._fbTimer = null; btn._fbRestore = null;
    btn.className = cls.join(' ');
    btn.innerHTML = html;
    btn.disabled = false;
    btn.style.minWidth = '';
    btn.removeAttribute('aria-busy');
  };
  let outcome = 'done';
  try {
    const result = await fn();
    const since = feedbackLog.slice(mark);
    if (result === false || since.includes('cancel') || since.includes('warn')) outcome = 'neutral';
    if (since.includes('error')) outcome = 'fail';
    return result;
  } catch (e) {
    outcome = 'fail';
    throw e;
  } finally {
    const wait = MIN_BUSY_MS - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (outcome === 'neutral' || !btn.isConnected) restore();
    else {
      const done = outcome === 'done';
      btn.removeAttribute('aria-busy');
      btn.classList.remove('state-busy');
      btn.classList.add(done ? 'state-done' : 'state-fail');
      btn.innerHTML = `${icon(done ? 'ok' : 'x')}${done ? 'Concluído' : 'Não Concluído'}`;
      btn.disabled = false;
      btn._fbRestore = restore;
      btn._fbTimer = setTimeout(restore, done ? DONE_MS : FAIL_MS);
    }
  }
}

/** Feedback imediato de clique: leve afundamento + onda a partir do ponto clicado. */
export function installPressFeedback(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .tabs button, .nav a, .game, .thread');
    if (!b || b.disabled) return;
    if (b._fbTimer && b.classList.contains('state-done')) { clearTimeout(b._fbTimer); b._fbRestore && b._fbRestore(); }
    const r = b.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'press-ripple';
    const size = Math.max(r.width, r.height) * 2;
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
    setTimeout(() => ripple.remove(), 800);
  });
  // Teclado (Enter/Espaço) também dá o retorno imediato
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest && e.target.closest('.btn');
    if (!b || b.disabled) return;
    b.classList.add('key-press');
    setTimeout(() => b.classList.remove('key-press'), 160);
  });
}

/** Painel de log que recebe as mensagens do processo principal para um escopo. */
export function logBox(scope, el) {
  el.classList.add('log');
  const off = api.on('log', ({ scope: s, line }) => { if (s === scope) append(line); });
  function append(line) {
    const div = document.createElement('div');
    if (/^\s*✓/.test(line)) div.className = 'ok';
    else if (/^\s*✗|erro|falh/i.test(line)) div.className = 'err';
    else if (/^\s*▶|^>/.test(line)) div.className = 'step';
    div.textContent = line;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  return { append, clear: () => { el.innerHTML = ''; }, dispose: off };
}

// O parâmetro "color" é mantido por compatibilidade, mas o arco sempre usa o token primário.
export function gaugeSvg(pct, color, size = 120, stroke = 10) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke: var(--ui-bg-accented)" stroke-width="${stroke}"/>
    <circle class="gauge-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke: var(--ui-primary)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/></svg>`;
}

/** Atualiza o arco de um medidor já desenhado, para a transição acontecer (em vez de recriar o SVG). */
export function updateGauge(container, pct) {
  const arc = container && container.querySelector('.gauge-arc');
  if (!arc) return false;
  const c = Number(arc.getAttribute('stroke-dasharray'));
  const p = Math.max(0, Math.min(100, pct || 0));
  arc.setAttribute('stroke-dashoffset', String(c * (1 - p / 100)));
  return true;
}

export function statusColor(s) { return { ok: 'var(--ui-success)', warn: 'var(--ui-warning)', bad: 'var(--ui-error)', info: 'var(--ui-info)' }[s] || 'var(--ui-text-muted)'; }

/**
 * Desenha um gráfico de linha simples num <canvas>.
 * "colors" recebe nomes de tokens (primary, info, important, warning, error, success, text-muted).
 */
export function drawLine(canvas, series, { max = 100, colors = ['primary', 'info', 'important'], fill = true } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth; const h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  colors = colors.map((c) => token(c) || c);
  ctx.strokeStyle = token('border');
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = (h / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  series.forEach((data, si) => {
    if (!data || data.length < 2) return;
    const n = data.length;
    const step = w / (Math.max(n, 60) - 1);
    const off = w - (n - 1) * step;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = off + i * step;
      const y = h - (Math.min(max, Math.max(0, v ?? 0)) / max) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colors[si % colors.length];
    ctx.lineWidth = 2;
    ctx.stroke();
    if (fill && si === 0) {
      ctx.lineTo(w, h); ctx.lineTo(off, h); ctx.closePath();
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = colors[0];
      ctx.fill();
      ctx.restore();
    }
  });
}

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  check: '<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  broom: '<path d="M19 3l-7 7"/><path d="M9.5 11.5l3 3"/><path d="M4 21c1-4 3-7 6-9l2 2c-2 3-5 5-8 7z"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".8"/><circle cx="18" cy="13.5" r=".8"/>',
  gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><path d="M15 10h4M15 14h4M6 18v3M10 18v3"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2"/><path d="M9 15l-3-3c1.5-4 5-8 13-9-1 8-5 11.5-9 13z"/><circle cx="15" cy="9" r="1.5"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  power: '<path d="M12 2v10"/><path d="M5.6 6.6a9 9 0 1012.8 0"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a15 15 0 0120 0"/><circle cx="12" cy="19.5" r="1"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  refresh: '<path d="M21 12a9 9 0 11-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gauge: '<path d="M12 14l4-6"/><path d="M3.5 18a9.5 9.5 0 1117 0"/>',
  restore: '<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.5" r=".6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 3-3 4-4 4 0-3-1-5-3-7 0 4-3 6-3 11 0 4 3 8 7 8z"/>'
};
export function icon(name, extra = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[name] || ''}</svg>`;
}

export function navigate(page) { location.hash = '#' + page; }

// Faixas de temperatura (°C) usadas nas telas: 'bad' >= 85, 'warn' >= 70. overlay.js tem uma cópia (não importa ui.js).
export const tempLevel = (t) => (t == null || Number.isNaN(t) ? '' : t >= 85 ? 'bad' : t >= 70 ? 'warn' : 'ok');
