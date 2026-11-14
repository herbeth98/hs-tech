// Overlay por cima do jogo, no design system do app (tokens de tokens.css).
(function () {
  const box = document.getElementById('box');
  let cfg = { scale: 1, opacity: 0.85, show: {}, hw: {} };
  let lastSize = '';
  const token = (n) => getComputedStyle(document.documentElement).getPropertyValue(`--ui-${n}`).trim();

  window.hs.on('overlay:config', (c) => {
    cfg = c;
    const op = Math.round(Math.max(0, Math.min(1, cfg.opacity)) * 100);
    box.style.background = `color-mix(in oklab, var(--ui-bg) ${op}%, transparent)`;
    box.style.transform = `scale(${cfg.scale})`;
  });

  const r0 = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n).toString());
  const r1 = (n) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(1));
  const gb = (b) => (b / 1073741824).toFixed(1);
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tempCls = (t) => (t >= 85 ? 'c-bad' : t >= 70 ? 'c-warn' : 'c-ok');
  const pct = (v) => Math.max(0, Math.min(100, v || 0));

  function block(cls, name, value, fill, extra) {
    return `<div class="blk ${cls}"><div class="head up"><span class="name">${esc(name)}</span><span class="val">${value}</span></div>
      <div class="track"><div class="fill" style="width:${pct(fill)}%"></div></div>${extra || ''}</div>`;
  }

  function graph(data) {
    const c = document.createElement('canvas');
    const w = 226, h = 30;
    c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.scale(2, 2);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const max = Math.max(avg * 2, ...data) * 1.05;
    x.strokeStyle = token('border-accented');
    x.setLineDash([2, 3]);
    x.beginPath(); x.moveTo(0, h - (avg / max) * h); x.lineTo(w, h - (avg / max) * h); x.stroke();
    x.setLineDash([]);
    x.beginPath();
    data.forEach((v, i) => { const px = (i / Math.max(1, data.length - 1)) * w; const py = h - (v / max) * h; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = token('primary'); x.lineWidth = 1.5; x.stroke();
    return c;
  }

  window.hs.on('monitor:sample', (s) => {
    const sh = cfg.show || {};
    const hw = cfg.hw || {};
    const f = s.fps || {};
    const has = !!f.app;
    const out = [];

    if (sh.game && has) out.push(`<div class="game up">${esc(f.app.replace(/\.exe$/i, ''))}</div>`);
    if (sh.fps || sh.low1 || sh.low01) {
      const side = [];
      if (sh.low1) side.push(`1% low <b>${has ? r0(f.low1) : '—'}</b>`);
      if (sh.low01) side.push(`0,1% <b>${has ? r0(f.low01) : '—'}</b>`);
      out.push(`<div class="fps">${sh.fps ? `<span class="lbl">FPS</span><span class="num">${has ? r0(f.fps) : '—'}</span>` : ''}<span class="side up">${side.join('<br>')}</span></div>`);
    }
    if (sh.graph && has && f.graph && f.graph.length > 2) out.push('<div id="g"></div>');
    if (sh.frametime) out.push(`<div class="ft up"><span>Frame time</span><b>${has ? r1(f.frametime) + ' ms' : '—'}</b></div>`);

    if (sh.cpu || sh.cpuClock) {
      const stats = sh.cpuClock && s.cpuClock ? `<div class="stats"><span>${r0(s.cpuClock)} MHz</span></div>` : '';
      out.push(block('cpu', hw.cpu || 'CPU', sh.cpu ? `${r0(s.cpu)}%` : '', s.cpu, stats));
    }

    if (s.gpu && (sh.gpu || sh.gpuTemp || sh.clock || sh.power || sh.vram)) {
      const g = s.gpu;
      const st = [];
      if (sh.gpuTemp && g.temp != null && !Number.isNaN(g.temp)) st.push(`<span class="${tempCls(g.temp)}">${r0(g.temp)} °C</span>`);
      if (sh.clock && g.clock) st.push(`<span>${r0(g.clock)} MHz</span>`);
      if (sh.power && g.power) st.push(`<span>${r0(g.power)} W</span>`);
      const vram = sh.vram && g.vramTotal ? `<div class="sub up"><span>VRAM ${r0(g.vramTotal / 1024)} GB</span><span>${(g.vramUsed / 1024).toFixed(1)} GB em uso</span></div>` : '';
      out.push(block('gpu', hw.gpu || 'GPU', sh.gpu ? `${r0(g.util)}%` : '', g.util, vram + (st.length ? `<div class="stats">${st.join('')}</div>` : '')));
    }

    if (sh.ram) out.push(block('ram', `RAM ${gb(s.ramUsed)} / ${Math.round(s.ramTotal / 1073741824)} GB`, `${r0(s.ram)}%`, s.ram));

    if ((sh.ping || sh.loss) && s.ping) {
      const p = s.ping;
      const left = sh.ping ? `<span><span class="k">Ping</span> <span class="${p.last == null ? 'c-bad' : p.last > 80 ? 'c-warn' : ''}">${p.last == null ? 'perdido' : r0(p.last) + ' ms'}</span></span>` : '<span></span>';
      const right = sh.loss ? `<span class="${p.lossPct > 2 ? 'c-bad' : p.lossPct > 0 ? 'c-warn' : 'c-ok'}">${r1(p.lossPct)}% perda</span>` : '';
      out.push(`<div class="net">${left}${right}</div>`);
    }
    if (sh.speed && s.speed) out.push(`<div class="net"><span><span class="k">Internet</span> ↓${r0(s.speed.download)} ↑${r0(s.speed.upload)}</span><span class="k">Mbps</span></div>`);

    out.push('<div class="brand"><img src="assets/icon.png" alt=""><span>HS</span><span class="tech">TECH</span></div>');
    box.innerHTML = out.join('');
    if (sh.graph && has && f.graph && f.graph.length > 2) document.getElementById('g').appendChild(graph(f.graph));

    const r = box.getBoundingClientRect();
    const size = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`;
    if (size !== lastSize) { lastSize = size; window.hs.resizeOverlay(Math.ceil(r.width) + 4, Math.ceil(r.height) + 4); }
  });
})();
