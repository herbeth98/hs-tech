import { api, call, esc, icon, toast, $ } from '../ui.js';

export async function render(el) {
  const [info, s, auto] = await Promise.all([call('app:info'), call('app:settings'), api.call('app:autostartStatus').catch(() => false)]);
  el.innerHTML = `
  <div class="page-head"><div><h1>Configurações</h1><p>Comportamento do HS TECH.</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>Geral</h3><div class="list">
      <div class="item"><div class="grow"><div class="title">Iniciar com o Windows</div><div class="desc">Abre minimizado na bandeja, já como administrador (sem pedir permissão), para aplicar os ajustes por jogo e os limites da GPU.</div></div><label class="switch"><input type="checkbox" id="auto" ${auto ? 'checked' : ''}><span></span></label></div>
      <div class="item"><div class="grow"><div class="title">Minimizar para a bandeja ao fechar</div><div class="desc">O X esconde a janela e o HS TECH continua rodando (ajustes por jogo).</div></div><label class="switch"><input type="checkbox" id="tray" ${s.minimizeToTray ? 'checked' : ''}><span></span></label></div>
      <div class="item"><div class="grow"><div class="title">Abrir escondido ao iniciar com o Windows</div><div class="desc">Vai direto para a bandeja.</div></div><label class="switch"><input type="checkbox" id="hidden" ${s.startHidden ? 'checked' : ''}><span></span></label></div>
      <div class="item"><div class="grow"><div class="title">Aplicar ajustes por jogo automaticamente</div><div class="desc">Afinidade de núcleos e prioridade quando o jogo abrir (página Jogos). Vale depois de reabrir o HS TECH.</div></div><label class="switch"><input type="checkbox" id="watch" ${s.gameWatcher ? 'checked' : ''}><span></span></label></div>
    </div></div>
    <div class="card"><h3>Sobre</h3><div class="kv">
      <div>Versão</div><div>HS TECH ${esc(info.version)}</div>
      <div>Permissão</div><div>${info.admin ? '<span class="badge ok">Administrador</span>' : '<span class="badge warn">Usuário comum</span>'}</div>
      <div>Windows</div><div>${esc(info.platform)}</div>
      <div>Dados</div><div class="mono small">${esc(info.userData)}</div></div>
      <div class="row mt"><button class="btn sm" id="openData">${icon('folder')}Abrir Pasta de Dados</button></div>
      <div class="callout small mt">O HS TECH não envia nenhum dado seu para fora. As únicas conexões são: teste de velocidade (Cloudflare), ping, winget (programas), e Windows Update (drivers), todas iniciadas por você.</div></div>
  </div>`;
  $('#auto', el).addEventListener('change', async (e) => {
    try { await api.call('app:autostart', e.target.checked); toast(e.target.checked ? 'O HS TECH vai iniciar com o Windows.' : 'Início automático desligado.', 'ok'); } catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
  });
  $('#tray', el).addEventListener('change', (e) => call('app:settings', { minimizeToTray: e.target.checked }));
  $('#hidden', el).addEventListener('change', (e) => call('app:settings', { startHidden: e.target.checked }));
  $('#watch', el).addEventListener('change', (e) => call('app:settings', { gameWatcher: e.target.checked }));
  $('#openData', el).addEventListener('click', () => call('shell:openPath', info.userData));
}

export function unmount() {}
