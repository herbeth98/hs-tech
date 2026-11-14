import { api, call, esc, icon, busy, toast, modal, logBox, $ } from '../ui.js';

let log;

// Ferramentas na ordem do print; "restore" = oferece criar ponto de restauração antes
const TOOLS = [
  { id: 'full', title: 'Reparo Completo (DISM + SFC)', desc: 'Repara a imagem do Windows e depois verifica todos os arquivos do sistema. Leva de 10 a 30 minutos.', restore: true },
  { id: 'sfc', title: 'Verificar Arquivos do Sistema (SFC)', desc: 'Procura arquivos do Windows corrompidos e os substitui por cópias corretas.', restore: true },
  { id: 'dismRestore', title: 'Reparar a Imagem do Windows (DISM)', desc: 'Corrige o repositório de componentes que o SFC usa. Precisa de internet.', restore: true },
  { id: 'chkdsk', title: 'Verificar o Disco C: (CHKDSK)', desc: 'Verifica o sistema de arquivos sem reiniciar. Se achar problemas, indica o reparo na próxima inicialização.' },
  { id: 'dns', title: 'Limpar o Cache de DNS', desc: 'Resolve sites que não abrem ou que apontam para o endereço errado.' },
  { id: 'renewIp', title: 'Renovar o Endereço IP', desc: 'Pede um novo endereço ao roteador. A conexão cai por alguns segundos.', confirm: true },
  { id: 'network', title: 'Redefinir a Rede', desc: 'Redefine Winsock e TCP/IP para os padrões do Windows. Corrige internet que não funciona após vírus ou VPN. Pede reinício.', restore: true, confirm: true },
  { id: 'winUpdate', title: 'Redefinir o Windows Update', desc: 'Para os serviços, renomeia as pastas de cache e reinicia. Corrige atualizações que falham ou travam.', restore: true },
  { id: 'printer', title: 'Destravar a Impressora', desc: 'Limpa a fila de impressão e reinicia o spooler. Resolve documentos presos na fila.' },
  { id: 'audio', title: 'Reiniciar o Áudio do Windows', desc: 'Reinicia os serviços de áudio. Resolve som que sumiu, chiado ou travamentos.' },
  { id: 'componentCleanup', title: 'Limpar Componentes Antigos (WinSxS)', desc: 'Apaga versões antigas de componentes do Windows e libera espaço no C:.' },
  { id: 'iconCache', title: 'Recriar o Cache de Ícones', desc: 'Corrige ícones em branco ou errados. A barra de tarefas pisca uma vez.' },
  { id: 'store', title: 'Reparar a Microsoft Store', desc: 'Registra a Store de novo e limpa o cache dela.' },
  { id: 'timeSync', title: 'Sincronizar o Relógio', desc: 'Acerta a hora pela internet. Relógio errado quebra login e certificados.' }
];

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Manutenção</h1><p>Ferramentas do próprio Windows para manter o sistema saudável e corrigir problemas. O comando exato é mostrado antes de rodar.</p></div>
    <div class="actions"><button class="btn danger hidden" id="cancel">${icon('stop')}Cancelar Tarefa</button></div></div>

  <div class="card weekly glow-card">
    <div class="row" style="gap:var(--space-3)">
      <span class="weekly-ic">${icon('activity')}</span>
      <h2 style="margin:0">Revisão Semanal</h2>
      <span class="badge info">Recomendado 1 Vez por Semana</span>
      <span class="spacer"></span><span class="small muted" id="lastWeekly"></span>
    </div>
    <p class="mt">Confere a saúde do Windows e corrige o que estiver danificado: disco, arquivos do sistema e imagem do Windows. Seus ajustes continuam aplicados. Leva de 10 a 30 minutos.</p>
    <ul class="checks"><li>${icon('ok')}Verificar o disco</li><li>${icon('ok')}Reparar a imagem do Windows</li><li>${icon('ok')}Verificar os arquivos protegidos do sistema</li></ul>
    <div class="row between"><span class="chip-restore">${icon('restore')}Cria ponto de restauração</span>
      <button class="btn primary lg boost-btn" id="weekly"><span class="shine" aria-hidden="true"></span>${icon('activity')}Fazer a Revisão Agora</button></div>
  </div>

  <h3 class="mt2" style="font-size:var(--text-lg)">Outras Ferramentas</h3>
  <div class="grid g2 tools" id="tools"></div>

  <div class="grid g2 mt2">
    <div class="card"><h3>Pontos de Restauração</h3><div class="sub">Uma "foto" das configurações do Windows. Se algo der errado, você volta para ela.</div>
      <div class="row"><input type="text" id="rpName" value="HS TECH - manual" style="flex:1" aria-label="Nome do ponto de restauração"><button class="btn primary" id="rpCreate">${icon('restore')}Criar Ponto</button></div>
      <div class="row mt"><button class="btn sm" id="rstrui">Restaurar o Sistema…</button><button class="btn sm ghost" id="sysdm">Configurar Proteção do Sistema</button></div>
      <div class="list mt" id="rpList"></div></div>
    <div class="card"><h3>Registro</h3><div id="log" style="height:340px"></div></div>
  </div>`;
  log = logBox('repair', $('#log', el));

  const cmds = Object.fromEntries((await call('repair:list')).map((r) => [r.id, r.cmd]));
  $('#tools', el).innerHTML = TOOLS.map((t) => `
    <div class="card tool"><h3>${esc(t.title)}</h3><p class="muted small">${esc(t.desc)}</p>
      <div class="row between">${t.restore ? `<span class="chip-restore">${icon('restore')}Cria ponto de restauração</span>` : '<span></span>'}
        <button class="btn" data-run="${t.id}">${icon('play')}Executar</button></div></div>`).join('');

  el.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => {
    const t = TOOLS.find((x) => x.id === b.dataset.run);
    runTool(el, b, t, cmds[t.id]);
  }));
  $('#weekly', el).addEventListener('click', (e) => runTool(el, e.currentTarget,
    { id: 'weekly', title: 'Revisão Semanal', restore: true, desc: 'Verifica o disco, repara a imagem do Windows e verifica os arquivos do sistema.' }, cmds.weekly));
  $('#cancel', el).addEventListener('click', () => call('task:cancel', 'repair'));
  $('#rstrui', el).addEventListener('click', () => call('shell:run', 'rstrui'));
  $('#sysdm', el).addEventListener('click', () => call('shell:run', 'sysdm'));
  $('#rpCreate', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    log.clear();
    const ok = await call('restore:create', $('#rpName', el).value || 'HS TECH');
    if (!ok) { toast('O Windows não criou o ponto. Ative a Proteção do Sistema no disco C: e tente de novo', 'error', 9000); return false; }
    toast('Ponto de restauração criado', 'ok');
    loadPoints(el);
  }, 'Criando…'));
  loadPoints(el);
  showLastWeekly(el);
}

async function runTool(el, btn, t, cmd) {
  const body = await modal({
    title: `Executar: ${t.title}?`,
    body: `<p style="margin-top:0">${esc(t.desc)}</p>
      <div class="small muted">Comando que será executado:</div><pre class="cmd">${esc(cmd || '')}</pre>
      ${t.restore ? '<label class="check mt"><input type="checkbox" id="mkRp" checked> Criar um ponto de restauração antes</label>' : ''}`,
    okText: 'Executar Agora'
  });
  if (!body) return;
  const mkRp = t.restore && body.querySelector('#mkRp')?.checked;
  const all = el.querySelectorAll('[data-run], #weekly');
  all.forEach((x) => { if (x !== btn) x.disabled = true; });
  $('#cancel', el)?.classList.remove('hidden');
  log.clear();
  try {
    await busy(btn, async () => {
      if (mkRp) {
        const ok = await call('restore:create', `HS TECH - antes de: ${t.title}`);
        if (!ok) log.append('Seguindo sem ponto de restauração (a Proteção do Sistema pode estar desligada).');
      }
      const ok = await call('repair:run', t.id);
      if (t.id === 'weekly') { await call('app:settings', { lastWeekly: new Date().toISOString() }); showLastWeekly(el); }
      toast(ok ? `${t.title} concluído` : `${t.title} terminou com avisos. Veja o registro`, ok ? 'ok' : 'warn', 7000);
      if (mkRp) loadPoints(el);
    }, 'Executando…');
  } finally {
    all.forEach((x) => { x.disabled = false; });
    $('#cancel', el)?.classList.add('hidden');
  }
}

async function showLastWeekly(el) {
  const s = await api.call('app:settings').catch(() => ({}));
  const box = $('#lastWeekly', el);
  if (!box) return;
  if (!s.lastWeekly) { box.textContent = 'Ainda não foi feita'; return; }
  const days = Math.floor((Date.now() - new Date(s.lastWeekly).getTime()) / 86400000);
  box.textContent = `Última revisão: ${new Date(s.lastWeekly).toLocaleDateString('pt-BR')}${days >= 7 ? ' · está na hora de fazer de novo' : ''}`;
  box.classList.toggle('c-warn', days >= 7);
}

async function loadPoints(el) {
  const pts = await call('restore:list').catch(() => []);
  const box = $('#rpList', el);
  if (!box) return;
  box.innerHTML = pts.length ? `<div class="small muted">Pontos existentes</div>` + pts.slice(0, 6).map((p) => `<div class="item" style="padding:7px 2px"><div class="grow">${esc(p.desc)}</div><span class="small muted">${new Date(p.date).toLocaleString('pt-BR')}</span></div>`).join('')
    : '<div class="small muted">Nenhum ponto de restauração. Se a criação falhar, ative a Proteção do Sistema no disco C:.</div>';
}

export function unmount() { if (log) log.dispose(); }
