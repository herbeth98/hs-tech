import { api, call, esc, icon, toast, modal, $, $$ } from '../ui.js';

const STEPS = [
  { id: 'restore', title: 'Criar ponto de restauração', desc: 'Antes de qualquer mudança.' },
  { id: 'apps', title: 'Instalar programas', desc: 'Escolha abaixo. Instalados em sequência, sem você clicar em nada.' },
  { id: 'debloat', title: 'Debloat recomendado', desc: 'Remove Notícias, Clima, Dicas, Solitaire, Clipchamp, Teams pessoal, propaganda pré-instalada etc.' },
  { id: 'privacy', title: 'Privacidade e telemetria', desc: 'Telemetria mínima, sem ID de anúncio, sem histórico de atividades, sem Bing no Iniciar, sem sugestões.' },
  { id: 'ai', title: 'Remover Copilot e bloquear Recall', desc: 'Inclui bloqueio por política para não voltarem.' },
  { id: 'boost', title: 'Boost de desempenho', desc: 'Plano HS TECH, Modo de Jogo, HAGS, sem Game DVR, input lag, estabilidade de FPS, sem Widgets, sem hibernação.' },
  { id: 'clean', title: 'Limpeza final', desc: 'Temporários, cache do Windows Update e logs da instalação.' }
];

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Windows Novo</h1><p>Acabou de formatar? Marque o que quer e deixe o HS TECH configurar tudo de uma vez: programas, debloat, privacidade e desempenho.</p></div></div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 420px;align-items:start">
    <div>
      <div class="card"><h3>Etapas</h3><div class="list">${STEPS.map((s) => `<label class="item check" style="cursor:pointer"><input type="checkbox" data-step="${s.id}" checked>
        <div class="grow"><div class="title">${esc(s.title)}</div><div class="desc">${esc(s.desc)}</div></div><span class="badge hidden" data-st="${s.id}"></span></label>`).join('')}</div></div>
      <div class="card mt"><div class="row between"><h3 style="margin:0">Programas</h3><div class="row"><button class="btn sm" data-preset="gamer">Kit Gamer</button><button class="btn sm" data-preset="basico">Kit Básico</button><button class="btn sm" data-preset="tech">Kit Tech</button><button class="btn sm ghost" id="none">Limpar Seleção</button></div></div>
        <div class="grid g3 mt" id="apps"><div class="muted">Carregando…</div></div></div>
    </div>
    <div class="card" style="position:sticky;top:0"><h3>Execução</h3>
      <div class="callout small">Deixe o PC ligado na tomada e conectado à internet. Leva de 10 a 40 minutos, conforme os programas escolhidos.</div>
      <button class="btn primary mt" id="go" style="width:100%;justify-content:center">${icon('sparkle')}Configurar Meu Windows</button>
      <div class="progress mt"><div id="bar"></div></div>
      <div class="log mt" id="log" style="height:360px"></div></div>
  </div>`;

  const cat = await call('winget:catalog');
  $('#apps', el).innerHTML = cat.categories.map((c) => `<div><div class="small muted" style="margin-bottom:4px">${esc(c.cat)}</div>${c.items.map((i) => `<label class="check" style="display:flex;padding:3px 0"><input type="checkbox" data-app="${esc(i.id)}" ${cat.presets.gamer.includes(i.id) ? 'checked' : ''}>${esc(i.name)}</label>`).join('')}</div>`).join('');
  el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const ids = cat.presets[b.dataset.preset];
    $$('[data-app]', el).forEach((x) => { x.checked = ids.includes(x.dataset.app); });
  }));
  $('#none', el).addEventListener('click', () => $$('[data-app]', el).forEach((x) => { x.checked = false; }));
  $('#go', el).addEventListener('click', () => run(el));
}

async function run(el) {
  const steps = $$('[data-step]', el).filter((c) => c.checked).map((c) => c.dataset.step);
  const appIds = $$('[data-app]', el).filter((c) => c.checked).map((c) => c.dataset.app);
  if (!steps.length) return;
  const ok = await modal({ title: 'Começar a configuração?', body: `${steps.length} etapa(s)${steps.includes('apps') ? ` e ${appIds.length} programa(s)` : ''}. Você pode usar o PC enquanto isso, mas evite reiniciar.`, okText: 'Começar Configuração' });
  if (!ok) return;
  const go = $('#go', el);
  go.disabled = true;
  const logEl = $('#log', el);
  const bar = $('#bar', el);
  const log = (t, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
  const off = api.on('log', ({ scope, line }) => { if (['newwin', 'clean', 'debloat'].includes(scope)) log(line); });
  const mark = (id, txt, cls) => { const b = el.querySelector(`[data-st="${id}"]`); if (b) { b.className = `badge ${cls}`; b.textContent = txt; } };
  let i = 0;
  const tick = () => { i++; bar.style.width = `${Math.round((i / steps.length) * 100)}%`; };
  try {
    const status = steps.some((s) => ['privacy', 'ai', 'boost'].includes(s)) ? await api.call('tweaks:status') : [];
    const applyGroups = async (groups) => {
      const todo = status.filter((t) => t.recommended && groups.includes(t.groupKey) && t.active !== true);
      for (const t of todo) {
        try { await api.call('tweaks:set', t.id, true); log(`  ✓ ${t.title}`, 'ok'); } catch (e) { log(`  ✗ ${t.title}: ${e.message}`, 'err'); }
      }
      if (!todo.length) log('  Tudo já estava aplicado.');
    };
    for (const s of steps) {
      mark(s, 'em andamento', 'info');
      log(`▶ ${STEPS.find((x) => x.id === s).title}`, 'step');
      try {
        if (s === 'restore') { const r = await api.call('restore:create', 'HS TECH - Windows novo', 'newwin'); if (!r) log('  Seguindo sem ponto de restauração.', 'err'); }
        if (s === 'apps') { if (appIds.length) { const r = await api.call('winget:install', appIds, 'newwin'); log(`  ${r.filter((x) => x.ok).length} de ${r.length} programa(s) instalados`, 'ok'); } else log('  Nenhum programa marcado.'); }
        if (s === 'debloat') { const list = await api.call('debloat:list'); const rec = list.filter((a) => a.recommended).map((a) => a.name); if (rec.length) await api.call('debloat:remove', rec); else log('  Nada para remover.'); }
        if (s === 'privacy') await applyGroups(['privacy']);
        if (s === 'ai') await applyGroups(['ai']);
        if (s === 'boost') await applyGroups(['perf', 'games', 'input', 'fps']);
        if (s === 'clean') { const r = await api.call('clean:run', 'safe'); log(`  ✓ ${(r.freed / 1048576).toFixed(0)} MB liberados`, 'ok'); }
        mark(s, 'concluído', 'ok');
      } catch (e) { log(`  ✗ ${e.message}`, 'err'); mark(s, 'com erro', 'bad'); }
      tick();
    }
    log('✓ Windows configurado! Reinicie o PC para todos os ajustes valerem.', 'ok');
    toast('Windows configurado. Reinicie o PC', 'ok', 10000);
  } finally {
    off();
    go.disabled = false;
  }
}

export function unmount() {}
