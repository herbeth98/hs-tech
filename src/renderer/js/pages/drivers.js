import { api, call, esc, fmtBytes, icon, busy, toast, modal, logBox, $, $$ } from '../ui.js';

let log;
const CLS = { DISPLAY: 'Vídeo', NET: 'Rede', MEDIA: 'Áudio', SYSTEM: 'Sistema/Chipset', HDC: 'Armazenamento', SCSIADAPTER: 'Armazenamento', USB: 'USB', BLUETOOTH: 'Bluetooth', HIDCLASS: 'Dispositivos de entrada', PRINTER: 'Impressora', CAMERA: 'Câmera', IMAGE: 'Câmera/Scanner', BIOMETRIC: 'Biometria', SOFTWARECOMPONENT: 'Componente', EXTENSION: 'Extensão' };

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Drivers</h1><p>Mostra os drivers instalados, dispositivos com erro e atualizações de driver disponíveis no Windows Update. Também faz backup dos drivers, útil antes de formatar.</p></div>
    <div class="actions"><button class="btn" id="dev">Abrir Gerenciador de Dispositivos</button><button class="btn" id="bk">${icon('download')}Fazer Backup dos Drivers</button><button class="btn primary" id="wu">${icon('refresh')}Procurar Atualizações</button></div></div>
  <div id="problems"></div>
  <div class="card mb" id="updates"><h3>Atualizações de Driver (Windows Update)</h3><div class="muted small">Clique em <b>Procurar atualizações</b>. A busca leva de 30 segundos a 2 minutos.</div></div>
  <div class="card mb"><h3>Placa de Vídeo: Driver Direto do Fabricante</h3><div class="sub">O Windows Update costuma ter drivers de vídeo antigos. Para jogos, baixe direto do fabricante:</div>
    <div class="row"><button class="btn sm" data-url="https://www.nvidia.com/pt-br/drivers/">Baixar Driver NVIDIA</button><button class="btn sm" data-url="https://www.amd.com/pt/support/download/drivers.html">Baixar Driver AMD</button><button class="btn sm" data-url="https://www.intel.com.br/content/www/br/pt/support/detect.html">Baixar Driver Intel</button>
    <span class="small muted">Para trocar de marca de placa ou corrigir driver corrompido, use o DDU (página Programas → Hardware).</span></div></div>
  <div class="card"><div class="row between"><h3 style="margin:0">Drivers Instalados</h3><input type="search" id="q" placeholder="Buscar…" style="width:240px"></div><div id="list" class="scroll mt" style="max-height:520px"><div class="empty">Lendo drivers…</div></div></div>
  <div class="card mt"><h3>Registro</h3><div id="log"></div></div>`;
  log = logBox('drivers', $('#log', el));
  $('#dev', el).addEventListener('click', () => call('shell:run', 'devmgmt'));
  el.querySelectorAll('[data-url]').forEach((b) => b.addEventListener('click', () => call('shell:open', b.dataset.url)));
  $('#bk', el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const dir = await call('dialog:openDir', 'Escolha a pasta para o backup (use um pendrive ou outro disco)');
    if (!dir) return;
    log.clear();
    const ok = await call('drivers:backup', dir);
    toast(ok ? 'Backup dos drivers concluído.' : 'O backup terminou com avisos. Veja o registro.', ok ? 'ok' : 'warn');
  }, 'Exportando…'));
  $('#wu', el).addEventListener('click', (e) => busy(e.currentTarget, () => search(el), 'Procurando…'));
  $('#q', el).addEventListener('input', () => drawList(el));
  load(el);
}

let data = { drivers: [], problems: [] };
async function load(el) {
  data = await call('drivers:list');
  const p = $('#problems', el);
  p.innerHTML = data.problems.length ? `<div class="card mb" style="border-color:var(--ui-error)"><h3>Dispositivos com problema (${data.problems.length})</h3><div class="list">${data.problems.map((d) => `
    <div class="item"><span class="dot bad"></span><div class="grow"><div class="title">${esc(d.name)}</div><div class="desc">${esc(d.reason)} · ${esc(d.cls || '')}</div></div></div>`).join('')}</div>
    <div class="row mt"><button class="btn sm" id="rescan">${icon('refresh')}Procurar Alterações de Hardware</button><span class="small muted">Depois, procure atualizações: o Windows Update costuma ter o driver que falta.</span></div></div>`
    : '<div class="callout mb">✓ Nenhum dispositivo com erro.</div>';
  $('#rescan', el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { await call('drivers:rescan'); load(el); }));
  drawList(el);
}

function drawList(el) {
  const q = ($('#q', el)?.value || '').toLowerCase();
  const list = data.drivers.filter((d) => !q || `${d.name} ${d.provider} ${d.cls}`.toLowerCase().includes(q));
  $('#list', el).innerHTML = `<table class="tbl"><thead><tr><th>Dispositivo</th><th>Tipo</th><th>Fornecedor</th><th>Versão</th><th>Data</th></tr></thead><tbody>
    ${list.map((d) => `<tr><td>${esc(d.name)}</td><td class="muted">${esc(CLS[d.cls] || d.cls)}</td><td class="muted">${esc(d.provider || '')}</td><td class="mono">${esc(d.version)}</td>
    <td>${d.date ? new Date(d.date).toLocaleDateString('pt-BR') : '—'} ${d.old ? '<span class="badge warn">antigo</span>' : ''}</td></tr>`).join('')}</tbody></table>`;
}

async function search(el) {
  const box = $('#updates', el);
  box.innerHTML = '<h3>Atualizações de Driver (Windows Update)</h3><div class="muted">Consultando o Windows Update…</div>';
  const ups = await call('drivers:search');
  if (!ups.length) { box.innerHTML = '<h3>Atualizações de Driver (Windows Update)</h3><div class="callout">✓ Nenhuma atualização de driver disponível no Windows Update.</div>'; return; }
  box.innerHTML = `<h3>Atualizações de Driver Disponíveis (${ups.length})</h3><div class="list">${ups.map((u) => `
    <label class="item check"><input type="checkbox" data-id="${esc(u.id)}" checked><div class="grow"><div class="title">${esc(u.title)}</div>
    <div class="desc">${esc(u.maker || '')} · ${esc(u.cls || '')} · ${u.date ? new Date(u.date).toLocaleDateString('pt-BR') : ''} · ${fmtBytes(u.size)}</div></div></label>`).join('')}</div>
    <div class="row mt"><button class="btn primary" id="inst">${icon('download')}Instalar Selecionados</button><span class="small muted">Crie um ponto de restauração antes se for atualizar driver de vídeo ou chipset.</span></div>`;
  $('#inst', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const ids = $$('input[data-id]', box).filter((i) => i.checked).map((i) => i.dataset.id);
    if (!ids.length) return;
    log.clear();
    await call('drivers:install', ids);
    toast('Instalação de drivers concluída. Veja o registro', 'ok', 7000);
    load(el);
  }, 'Instalando…'));
}

export function unmount() { if (log) log.dispose(); }
