// Roteador e menu lateral.
import { $, api, icon, esc, toast, modal, installPressFeedback } from './ui.js';

// Feedback imediato em todo clique de botão
installPressFeedback();

// Pausa as animações decorativas quando a janela não está em foco ou está escondida
const setIdle = () => document.body.classList.toggle('app-idle', document.hidden || !document.hasFocus());
window.addEventListener('blur', setIdle);
window.addEventListener('focus', setIdle);
document.addEventListener('visibilitychange', setIdle);
setTimeout(setIdle, 0);

// Fundo que reage ao mouse
import('./bg.js').then((m) => m.installInteractiveBackground()).catch(() => {});

// ---------------- Abertura (2 s) ----------------
// O app monta por baixo enquanto a tela de abertura roda; as animações de entrada só tocam depois.
document.body.classList.add('booting');
const BOOT_MS = 2000;
const bootDone = (async () => {
  document.getElementById('splash')?.classList.add('go'); // liga as animações junto com o relógio
  const st = document.getElementById('splashStatus');
  [[0, 'Iniciando…'], [500, 'Lendo o hardware…'], [1100, 'Preparando o painel…'], [1750, 'Pronto']]
    .forEach(([t, txt]) => setTimeout(() => { if (st) st.textContent = txt; }, t));
  api.call('sys:info').catch(() => {}); // adianta a leitura do hardware (fica em cache para o Painel)
  await new Promise((r) => setTimeout(r, BOOT_MS));
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 340); }
  document.body.classList.remove('booting');
  document.body.classList.add('booted');
})();

const NAV = [
  { title: 'Visão Geral', items: [
    ['painel', 'Painel', 'dashboard'], ['hwmon', 'Hardware Monitor', 'gauge'], ['checkup', 'Check-up', 'check'], ['benchmark', 'Benchmark', 'trophy']
  ] },
  { title: 'Otimizar', items: [
    ['otimizacao', 'Otimização', 'bolt'], ['limpeza', 'Limpeza', 'broom'], ['jogos', 'Jogos', 'game'],
    ['gpu', 'Placa de Vídeo', 'gpu'], ['overclock', 'Overclock Seguro', 'flame']
  ] },
  { title: 'Sistema', items: [
    ['programas', 'Programas', 'box'], ['inicializacao', 'Inicialização', 'power'], ['debloat', 'Debloat', 'trash'],
    ['diagnostico', 'Diagnóstico', 'shield'], ['drivers', 'Drivers', 'chip'], ['windows-novo', 'Windows Novo', 'sparkle'], ['reparo', 'Manutenção', 'wrench']
  ] },
  { title: 'Ferramentas', items: [
    ['monitor', 'Monitor', 'activity'], ['rede', 'Rede', 'wifi'], ['testes', 'Testes', 'mouse'], ['config', 'Configurações', 'settings']
  ] }
];

const sidebar = $('#sidebar');
let n = 0;
sidebar.innerHTML = '<div class="nav-indicator" aria-hidden="true"></div>' + NAV.map((g) => `
  <div class="nav-group"><div class="nav-title">${esc(g.title)}</div>
  <div class="nav">${g.items.map(([id, label, ic]) => `<a data-page="${id}" style="--n:${n++}">${icon(ic)}<span>${esc(label)}</span></a>`).join('')}</div></div>`).join('');

// Indicador que desliza até o item ativo (movimento entre posições = ease-in-out)
const indicator = sidebar.querySelector('.nav-indicator');
// Posição do item dentro do menu lateral. Soma os offsetTop até chegar ao menu, porque os grupos
// (animados na rolagem) viram "pais posicionados" e o offsetTop sozinho fica relativo ao grupo.
function topInSidebar(el) {
  let t = 0;
  for (let n = el; n && n !== sidebar; n = n.offsetParent) t += n.offsetTop;
  return t;
}
function moveIndicator(instant) {
  const a = sidebar.querySelector('a.active');
  if (!a) { indicator.style.opacity = '0'; return; }
  if (instant) indicator.classList.add('no-anim');
  indicator.style.opacity = '1';
  indicator.style.transform = `translateY(${topInSidebar(a)}px)`;
  indicator.style.height = `${a.offsetHeight}px`;
  if (instant) requestAnimationFrame(() => indicator.classList.remove('no-anim'));
}
window.addEventListener('resize', () => moveIndicator(true));

// Bordas esmaecidas quando há mais itens para rolar
function updateFades() {
  const top = sidebar.scrollTop > 4;
  const bottom = sidebar.scrollTop + sidebar.clientHeight < sidebar.scrollHeight - 4;
  sidebar.classList.toggle('fade-top', top);
  sidebar.classList.toggle('fade-bottom', bottom);
}
sidebar.addEventListener('scroll', updateFades, { passive: true });
window.addEventListener('resize', updateFades);
requestAnimationFrame(updateFades);
sidebar.addEventListener('click', (e) => { const a = e.target.closest('a[data-page]'); if (a) location.hash = '#' + a.dataset.page; });

let current = null;
let token = 0;

async function route() {
  const page = (location.hash || '#painel').slice(1).split('?')[0] || 'painel';
  for (const a of sidebar.querySelectorAll('a')) a.classList.toggle('active', a.dataset.page === page);
  moveIndicator(!route.started);
  route.started = true;
  const act = sidebar.querySelector('a.active');
  if (act) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const my = ++token;
  if (current && current.unmount) { try { current.unmount(); } catch {} }
  current = null;
  const main = $('#main');
  main.innerHTML = '';
  main.scrollTop = 0;
  try {
    const mod = await import(`./pages/${page}.js`);
    if (my !== token) return;
    current = mod;
    await mod.render(main);
  } catch (e) {
    console.error(e);
    if (my === token) main.innerHTML = `<div class="card"><h2>Não Foi Possível Abrir a Página</h2><pre class="mono">${esc(e.stack || e.message)}</pre></div>`;
  }
}

window.addEventListener('hashchange', route);

(async () => {
  try {
    const info = await api.call('app:info');
    const b = $('#adminBadge');
    b.classList.remove('hidden');
    if (info.admin) { b.className = 'admin ok'; b.textContent = '● Administrador'; }
    else {
      b.className = 'admin no';
      b.textContent = '⚠ Sem Administrador: Clique para Reabrir como Admin';
      b.onclick = async () => {
        const ok = await modal({ title: 'Reabrir como administrador', body: 'A maioria das funções (ajustes, reparo, debloat, FPS) precisa de privilégios de administrador. O HS TECH vai fechar e abrir de novo pedindo permissão.', okText: 'Reabrir como Admin' });
        if (ok) api.call('app:relaunchAdmin');
      };
    }
  } catch (e) { toast(e.message, 'error'); }
  api.on('games:applied', (ev) => toast(`Ajustes aplicados em ${ev.exe} (PID ${ev.pid})${ev.mask ? ` · afinidade 0x${ev.mask}` : ''}${ev.priority ? ` · prioridade ${ev.priority}` : ''}`, 'ok'));
  await bootDone;
  route();
})();
