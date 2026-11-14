import { api, call, esc, fmtBytes, icon, busy, toast, modal, $, $$ } from '../ui.js';

let games = [];
let topo = null;
let presets = [];
let selId = null;
let filter = '';

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Jogos</h1><p>O HS TECH encontra os jogos da Steam, Epic, GOG, Ubisoft, EA, Riot, Battle.net e Xbox. Escolha um jogo para ajustar núcleos, prioridade, placa de vídeo e tela cheia.</p></div>
    <div class="actions"><input type="search" id="q" placeholder="Buscar jogo…" style="width:220px"><button class="btn" id="add">${icon('plus')}Adicionar Jogo</button><button class="btn" id="rescan">${icon('refresh')}Procurar Novamente</button></div></div>
  <div class="grid" style="grid-template-columns: minmax(0,1fr) 460px; align-items:start">
    <div><div class="games" id="games"><div class="card empty">Procurando jogos instalados…</div></div></div>
    <div class="card" id="detail" style="position:sticky;top:0"><div class="empty">Escolha um jogo à esquerda.</div></div>
  </div>`;
  $('#q', el).addEventListener('input', (e) => { filter = e.target.value.toLowerCase(); drawList(el); });
  $('#rescan', el).addEventListener('click', (e) => busy(e.currentTarget, () => load(el, true), 'Procurando…'));
  $('#add', el).addEventListener('click', async () => {
    const exe = await call('dialog:openExe');
    if (!exe) return;
    selId = await call('games:addManual', exe);
    await load(el, false);
  });
  const t = await call('games:topology').catch(() => null);
  if (t) { topo = t.topo; presets = t.presets; }
  await load(el, false);
}

async function load(el, force) {
  games = await call('games:scan', force);
  drawList(el);
  if (selId) drawDetail(el);
}

function drawList(el) {
  const box = $('#games', el);
  if (!box) return;
  const list = games.filter((g) => !filter || g.name.toLowerCase().includes(filter));
  if (!list.length) { box.innerHTML = `<div class="card empty" style="grid-column:1/-1">${games.length ? 'Nenhum jogo com esse nome.' : 'Nenhum jogo encontrado. Use <b>Adicionar .exe</b> para incluir um jogo à mão.'}</div>`; return; }
  box.innerHTML = list.map((g) => {
    const s = g.settings || {};
    const tags = [];
    if (s.affinity && s.affinity !== 'default') tags.push('Núcleos');
    if (s.priority && s.priority !== 'normal') tags.push('Prioridade');
    if (s.gpu === 'high') tags.push('GPU dedicada');
    if (s.disableFSO) tags.push('Sem FSO');
    return `<div class="game ${g.id === selId ? 'sel' : ''}" data-id="${esc(g.id)}">
      <div class="row between"><span class="badge ${g.store === 'Steam' ? 'info' : g.store === 'Epic' ? 'violet' : ''}">${esc(g.store)}</span>${g.exeExists ? '' : '<span class="badge warn">sem .exe</span>'}</div>
      <div class="name">${esc(g.name)}</div>
      <div class="small muted ellipsis" title="${esc(g.dir)}">${esc(g.dir)}</div>
      <div class="row" style="gap:4px">${tags.map((t) => `<span class="badge ok">${t}</span>`).join('')}</div></div>`;
  }).join('');
  box.querySelectorAll('.game').forEach((c) => c.addEventListener('click', () => { selId = c.dataset.id; drawList(el); drawDetail(el); }));
}

function maskThreads(hex) {
  const m = BigInt('0x' + hex);
  const out = [];
  for (let i = 0n; i < 64n; i++) if (m & (1n << i)) out.push(Number(i));
  return out;
}

function drawDetail(el) {
  const g = games.find((x) => x.id === selId);
  const box = $('#detail', el);
  if (!g || !box) return;
  const s = { affinity: 'default', priority: 'normal', gpu: 'default', disableFSO: false, runAsAdmin: false, customThreads: [], ...(g.settings || {}) };
  const t = topo;
  const presetOk = (p) => {
    if (!t) return p.id === 'default';
    if (p.hybridOnly && !t.hybrid) return false;
    if ((p.id === 'physical' || p.id === 'physicalNoCore0') && !t.smt) return p.id === 'physicalNoCore0' ? true : false;
    return true;
  };
  box.innerHTML = `
    <div class="row between"><h2 style="margin:0">${esc(g.name)}</h2><span class="badge">${esc(g.store)}</span></div>
    <div class="small muted mt">Executável</div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="exe" value="${esc(s.exe || g.exe || '')}" style="flex:1" spellcheck="false"><button class="btn sm" id="pick">Trocar Executável</button></div>
    <div class="row mt" style="gap:6px">
      <button class="btn sm" id="folder">${icon('folder')}Abrir Pasta</button>
      <button class="btn sm" id="check">${icon('check')}Conferir Pasta</button>
      ${g.appid ? `<button class="btn sm" id="verify">${icon('refresh')}Verificar Arquivos (Steam)</button>` : ''}
      <button class="btn sm" id="launch">${icon('play')}Abrir Jogo</button>
      ${g.store === 'Manual' ? `<button class="btn sm danger" id="remove">Remover Jogo</button>` : ''}
    </div>
    <div id="checkOut"></div>

    <h3 class="mt2">Núcleos do Processador</h3>
    <div class="small muted mb">${t ? `${esc(t.cpu)} · ${t.coreCount} núcleos · ${t.logical} threads${t.smt ? ' · SMT/HT ligado' : ' · SMT/HT desligado'}${t.hybrid ? ` · ${t.pCoreCount} P-cores + ${t.eCoreCount} E-cores` : ''}` : 'Topologia indisponível'}</div>
    <div class="list" id="aff">${presets.map((p) => `<label class="check" style="padding:5px 0;${presetOk(p) ? '' : 'opacity:.45'}"><input type="radio" name="aff" value="${p.id}" ${s.affinity === p.id ? 'checked' : ''} ${presetOk(p) ? '' : 'disabled'}><span><b style="font-weight:600">${esc(p.title)}</b><br><span class="small muted">${esc(p.desc)}${!presetOk(p) && p.hybridOnly ? ' (seu processador não é híbrido)' : !presetOk(p) ? ' (SMT/HT está desligado: já é o padrão)' : ''}</span></span></label>`).join('')}</div>
    <div id="threads" class="threads mt"></div>

    <h3 class="mt2">Prioridade e Placa de Vídeo</h3>
    <div class="grid g2">
      <label class="small muted">Prioridade da CPU<select id="prio" style="width:100%;margin-top:4px"><option value="normal">Normal</option><option value="above">Acima do normal</option><option value="high">Alta</option></select></label>
      <label class="small muted">Placa de vídeo<select id="gpu" style="width:100%;margin-top:4px"><option value="default">Deixar o Windows decidir</option><option value="high">Alto desempenho (dedicada)</option><option value="low">Economia de energia (integrada)</option></select></label>
    </div>
    <div class="list mt">
      <label class="check" style="padding:4px 0"><input type="checkbox" id="fso" ${s.disableFSO ? 'checked' : ''}> Desativar otimizações de tela cheia (jogos DX9/DX11)</label>
      <label class="check" style="padding:4px 0"><input type="checkbox" id="admin" ${s.runAsAdmin ? 'checked' : ''}> Executar sempre como administrador</label>
    </div>
    <div class="callout small mt">A <b>prioridade</b>, a <b>placa de vídeo</b> e a <b>tela cheia</b> ficam gravadas no Windows. A <b>afinidade de núcleos</b> não tem ajuste permanente no Windows: ela é aplicada quando o jogo abre, com o HS TECH aberto (pode ficar na bandeja), ou pelo <b>atalho otimizado</b> na Área de Trabalho.</div>
    <div class="row mt"><button class="btn primary" id="save">${icon('check')}Salvar Ajustes</button><button class="btn" id="lnk">${icon('link')}Criar Atalho Otimizado</button></div>`;

  $('#prio', box).value = s.priority;
  $('#gpu', box).value = s.gpu;

  let custom = new Set(s.customThreads || []);
  const drawThreads = () => {
    const sel = box.querySelector('input[name=aff]:checked')?.value || 'default';
    const th = $('#threads', box);
    if (!t) { th.innerHTML = ''; return; }
    const all = t.cores.flatMap((c) => c.threads.map((x) => ({ x, perf: c.perf })));
    const on = sel === 'custom' ? custom : new Set(sel === 'default' ? all.map((a) => a.x) : maskThreads(t.masks[sel] || 'FFFFFFFFFFFFFFFF'));
    th.innerHTML = all.map((a) => `<div class="thread ${on.has(a.x) ? 'on' : ''} ${a.perf ? '' : 'e'}" data-x="${a.x}" title="Thread ${a.x}${a.perf ? '' : ' (E-core)'}">${a.x}</div>`).join('') +
      `<div class="small muted" style="width:100%">${sel === 'custom' ? 'Clique nas threads para escolher.' : 'Threads usadas pelo jogo.'}${t.hybrid ? ' Borda tracejada = E-core.' : ''}</div>`;
    if (sel === 'custom') th.querySelectorAll('.thread').forEach((d) => d.addEventListener('click', () => { const x = Number(d.dataset.x); custom.has(x) ? custom.delete(x) : custom.add(x); drawThreads(); }));
  };
  box.querySelectorAll('input[name=aff]').forEach((r) => r.addEventListener('change', () => {
    if (r.value === 'custom' && !custom.size && t) custom = new Set(t.cores.flatMap((c) => c.threads));
    drawThreads();
  }));
  drawThreads();

  const collect = () => ({
    exe: $('#exe', box).value.trim(),
    affinity: box.querySelector('input[name=aff]:checked')?.value || 'default',
    customThreads: [...custom].sort((a, b) => a - b),
    priority: $('#prio', box).value,
    gpu: $('#gpu', box).value,
    disableFSO: $('#fso', box).checked,
    runAsAdmin: $('#admin', box).checked
  });

  $('#pick', box).addEventListener('click', async () => { const exe = await call('dialog:openExe'); if (exe) $('#exe', box).value = exe; });
  $('#folder', box).addEventListener('click', () => call('shell:openPath', g.dir));
  $('#launch', box).addEventListener('click', () => call('games:launch', { ...g, exe: $('#exe', box).value.trim() }));
  $('#verify', box)?.addEventListener('click', () => call('games:verify', g));
  $('#remove', box)?.addEventListener('click', async () => { await call('games:removeManual', g.id); selId = null; $('#detail', el).innerHTML = '<div class="empty">Escolha um jogo à esquerda.</div>'; load(el, false); });
  $('#check', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('games:checkFolder', { ...g, exe: $('#exe', box).value.trim() });
    const disk = r.disk && r.disk.media ? `${r.disk.media}${r.disk.bus ? ' · ' + r.disk.bus : ''}` : 'desconhecido';
    const hdd = r.disk && /HDD/i.test(r.disk.media);
    $('#checkOut', box).innerHTML = `<div class="kv mt small">
      <div>Pasta</div><div>${r.dirExists ? '<span class="badge ok">existe</span>' : '<span class="badge bad">não encontrada</span>'} <span class="mono">${esc(r.dir)}</span></div>
      <div>Executável</div><div>${r.exeExists ? `<span class="badge ok">ok</span> ${fmtBytes(r.exeSize)} · modificado em ${new Date(r.exeModified).toLocaleDateString('pt-BR')}` : '<span class="badge bad">não encontrado</span> escolha o .exe certo'}</div>
      <div>Tamanho</div><div>${fmtBytes(r.size)} em ${r.files.toLocaleString('pt-BR')} arquivos</div>
      <div>Disco</div><div>${esc(r.drive)} · ${esc(disk)} ${hdd ? '<span class="badge warn">HD: jogos carregam bem mais rápido em SSD</span>' : ''}</div>
      <div>Defender</div><div>${r.defenderExcluded ? '<span class="badge info">pasta excluída da verificação</span>' : 'Pasta verificada normalmente'}</div></div>`;
  }, 'Conferindo…'));
  $('#save', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const st = collect();
    if (!st.exe) { toast('Escolha o executável do jogo', 'warn'); return; }
    if (st.priority === 'high') {
      const ok = await modal({ title: 'Prioridade alta', body: 'Com prioridade alta, o jogo passa na frente de quase tudo. Em CPUs com poucos núcleos, Discord e streaming podem engasgar. Continuar?', okText: 'Continuar Mesmo Assim' });
      if (!ok) return;
    }
    const saved = await call('games:apply', g, st);
    g.settings = saved; g.exe = saved.exe;
    toast(`Ajustes de ${g.name} salvos.${st.affinity !== 'default' ? ' A afinidade vale na próxima vez que o jogo abrir.' : ''}`, 'ok', 6000);
    drawList(el);
  }, 'Salvando…'));
  $('#lnk', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const st = collect();
    const saved = await call('games:apply', g, st);
    g.settings = saved;
    const p = await call('games:shortcut', g);
    toast(`Atalho criado na Área de Trabalho: ${p.split('\\').pop()}`, 'ok', 6000);
  }));
}

export function unmount() {}
