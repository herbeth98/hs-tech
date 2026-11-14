import { api, call, esc, gaugeSvg, icon, busy, navigate, statusColor, $ } from '../ui.js';

// Estado em texto ao lado da bolinha (design: nunca indicar estado só por cor). "info" conta como "ok", igual à contagem do resumo.
const STATUS_BADGE = { ok: ['ok', 'ok'], info: ['ok', 'ok'], warn: ['warn', 'atenção'], bad: ['bad', 'problema'] };

// O botão só abre a página de destino: o rótulo diz isso (verbo + nome da página, como no menu lateral).
const FIX = { clean: ['limpeza', 'Abrir Limpeza'], tweaks: ['otimizacao', 'Abrir Otimização'], startup: ['inicializacao', 'Abrir Inicialização'], restore: ['reparo', 'Abrir Reparo'], xmp: ['overclock', 'Abrir Overclock Seguro'] };

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Check-up do PC</h1><p>Verifica armazenamento, memória, energia, jogos, privacidade, segurança e drivers, e dá uma nota de 0 a 100.</p></div>
    <div class="actions"><button class="btn primary" id="run">${icon('check')}Fazer Check-up</button></div></div>
  <div id="out"><div class="card empty">Clique em <b>Fazer check-up</b>. Leva uns 20 segundos.</div></div>`;
  const run = $('#run', el);
  run.addEventListener('click', () => busy(run, () => go(el), 'Verificando…'));
  go(el, run);
}

async function go(el, btn) {
  const out = $('#out', el);
  if (btn) btn.disabled = true;
  out.innerHTML = '<div class="card empty"><span class="spin" style="display:inline-block;width:18px;height:18px;border:2px solid var(--ui-primary);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span><div class="mt">Verificando o PC…</div></div>';
  try {
    const r = await call('sys:checkup');
    const groups = [...new Set(r.items.map((i) => i.group))];
    const counts = { ok: 0, warn: 0, bad: 0 };
    r.items.forEach((i) => { counts[i.status === 'info' ? 'ok' : i.status]++; });
    const verdict = r.score >= 90 ? 'Excelente' : r.score >= 75 ? 'Bom' : r.score >= 55 ? 'Precisa de Atenção' : 'Ruim';
    out.innerHTML = `
      <div class="card hero row" style="gap:28px">
        <div class="gauge" style="width:150px;height:150px">${gaugeSvg(r.score, 'url(#gg)', 150, 12)}<div class="gv"><b style="font-size:38px">${r.score}</b><span>de 100</span></div></div>
        <div><h2 style="font-size:22px;margin:0">${verdict}</h2>
          <div class="row mt"><span class="badge ok">${counts.ok} ok</span><span class="badge warn">${counts.warn} atenção</span><span class="badge bad">${counts.bad} problema(s)</span></div>
          <p class="muted">Itens em amarelo ou vermelho têm um botão para resolver.</p></div>
      </div>
      <div class="grid g2 mt">${groups.map((g) => `<div class="card"><h3>${esc(g)}</h3><div class="list">${r.items.filter((i) => i.group === g).map((i) => `
        <div class="item"><span class="dot ${i.status}"></span><div class="grow"><div class="row"><span class="title">${esc(i.title)}</span><span class="badge ${(STATUS_BADGE[i.status] || STATUS_BADGE.ok)[0]}">${(STATUS_BADGE[i.status] || STATUS_BADGE.ok)[1]}</span></div><div class="desc">${esc(i.detail)}</div></div>
        ${i.fix && i.status !== 'ok' && FIX[i.fix] ? `<button class="btn sm" data-go="${FIX[i.fix][0]}">${FIX[i.fix][1]}</button>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`;
    out.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
  } catch (e) {
    out.innerHTML = `<div class="card">Falha no check-up: ${esc(e.message)}</div>`;
  } finally { if (btn) btn.disabled = false; }
}
