// "Otimização completa": ponto de restauração + ajustes recomendados + limpeza, num clique.
import { api, esc, modal, toast } from './ui.js';

const STEPS = [
  ['restore', 'Criar ponto de restauração antes (recomendado)', true],
  ['perf', 'Desempenho: plano de energia HS TECH, Widgets, apps em segundo plano, hibernação', true],
  ['games', 'Jogos: Modo de Jogo, HAGS, sem Game DVR, prioridade multimídia, mouse sem aceleração', true],
  ['input', 'Input lag: prioridade de primeiro plano, timer global, USB sem suspensão, Nagle', true],
  ['fps', 'Estabilidade de FPS: sem estacionamento de núcleos, sem Power Throttling', true],
  ['privacy', 'Privacidade: telemetria, anúncios, histórico de atividades, Bing no Iniciar', true],
  ['ai', 'IA da Microsoft: remover Copilot e bloquear Recall', true],
  ['clean', 'Limpeza segura: temporários, cache do Windows Update, despejos e logs', true]
];
const GROUPS = { perf: 'Desempenho', games: 'Jogos', input: 'Input lag', fps: 'Estabilidade de FPS', privacy: 'Privacidade', ai: 'IA da Microsoft' };

// direct = true: pula a lista de etapas e roda direto o preset (usado pelo Boost do Painel)
export async function runFullOptimization(btn, preset, onDone, direct = false) {
  const body = direct ? null : await modal({
    title: 'Otimização completa',
    body: `<p class="muted" style="margin-top:0">Aplica só os ajustes marcados como <b>recomendados</b>. Ajustes de risco (Defender, VBS, timer do boot) ficam de fora. Tudo pode ser desfeito na página Otimização.</p>
      <div class="list">${STEPS.map(([id, label, on]) => `<label class="check item" style="padding:8px 2px"><input type="checkbox" data-step="${id}" ${(preset ? preset.includes(id) : on) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div>`,
    okText: 'Otimizar Agora'
  });
  if (!direct && !body) return;
  const chosen = direct ? preset : [...body.querySelectorAll('[data-step]')].filter((c) => c.checked).map((c) => c.dataset.step);
  if (!chosen.length) return;
  if (btn) btn.disabled = true;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="width:min(720px,94vw)"><h3>Otimizando…</h3>
    <div class="progress mt"><div id="fo-bar"></div></div><div class="log mt" id="fo-log" style="height:300px"></div>
    <div class="foot"><button class="btn primary" id="fo-close" disabled>Fechar Resumo</button></div></div>`;
  document.body.appendChild(bg);
  const logEl = bg.querySelector('#fo-log');
  const bar = bg.querySelector('#fo-bar');
  const log = (t, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
  const offLog = api.on('log', ({ scope, line }) => { if (scope === 'fullopt' || scope === 'clean') log('   ' + line.trim()); });

  let done = 0; let errors = 0;
  try {
    const status = await api.call('tweaks:status');
    const groups = chosen.filter((c) => GROUPS[c]).map((c) => GROUPS[c]);
    const todo = status.filter((t) => t.recommended && groups.includes(t.group) && t.active !== true);
    const total = (chosen.includes('restore') ? 1 : 0) + todo.length + (chosen.includes('clean') ? 1 : 0);
    const tick = () => { done++; bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`; };

    if (chosen.includes('restore')) {
      log('▶ Criando ponto de restauração…', 'step');
      const ok = await api.call('restore:create', 'HS TECH - antes da otimização completa', 'fullopt').catch((e) => { log('✗ ' + e.message, 'err'); return false; });
      if (!ok) log('   Seguindo sem ponto de restauração (a Proteção do Sistema pode estar desligada).', 'err');
      tick();
    }
    for (const t of todo) {
      log(`▶ ${t.title}`, 'step');
      try {
        const r = await api.call('tweaks:set', t.id, true);
        log(r.active ? '  ✓ aplicado' : '  ✓ executado (confira após reiniciar)', 'ok');
      } catch (e) { errors++; log('  ✗ ' + e.message, 'err'); }
      tick();
    }
    const already = status.filter((t) => t.recommended && groups.includes(t.group) && t.active === true).length;
    if (already) log(`${already} ajuste(s) recomendados já estavam aplicados.`);
    if (chosen.includes('clean')) {
      log('▶ Limpeza segura…', 'step');
      const r = await api.call('clean:run', ['usertemp', 'wintemp', 'wucache', 'dumps', 'logs', 'delivery']).catch((e) => { log('✗ ' + e.message, 'err'); return null; });
      if (r) log(`  ✓ ${(r.freed / 1024 / 1024).toFixed(0)} MB liberados`, 'ok');
      tick();
    }
    bar.style.width = '100%';
    log(errors ? `Concluído com ${errors} aviso(s).` : '✓ Otimização completa concluída. Reinicie o PC para todos os ajustes valerem.', errors ? 'err' : 'ok');
    bg.querySelector('h3').textContent = 'Otimização Concluída';
    toast('Otimização completa concluída. Reinicie o PC', 'ok', 8000);
  } catch (e) {
    log('✗ ' + e.message, 'err');
  } finally {
    offLog();
    const close = bg.querySelector('#fo-close');
    close.disabled = false;
    close.onclick = () => { bg.remove(); if (btn) btn.disabled = false; if (onDone) onDone(); if (location.hash.startsWith('#otimizacao')) window.dispatchEvent(new HashChangeEvent('hashchange')); };
  }
}
