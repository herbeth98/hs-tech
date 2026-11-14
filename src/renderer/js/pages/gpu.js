import { api, call, esc, fmt, icon, busy, toast, modal, $ } from '../ui.js';

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Placa de Vídeo</h1><p>Estado da GPU, perfil do driver NVIDIA para jogos e limites de potência e clock.</p></div>
    <div class="actions"><button class="btn" id="refresh">${icon('refresh')}Atualizar Lista</button></div></div>
  <div id="info" class="card"><div class="muted">Lendo a placa de vídeo…</div></div>
  <div class="grid g2 mt">
    <div class="card" id="profile"><h3>Perfil do Driver NVIDIA</h3><div class="muted">Lendo configurações do driver…</div></div>
    <div class="card" id="limits"><h3>Potência e Clock</h3><div class="muted">...</div></div>
  </div>`;
  $('#refresh', el).addEventListener('click', (e) => busy(e.currentTarget, () => load(el)));
  await load(el);
}

async function load(el) {
  const info = await api.call('gpu:info').catch(() => null);
  if (!info) {
    $('#info', el).innerHTML = `<h3>Nenhuma Placa NVIDIA Encontrada</h3><p class="muted">O perfil do driver e os limites usam ferramentas da NVIDIA (nvidia-smi e NVAPI). Para AMD, use o AMD Software: Adrenalin (Anti-Lag, Radeon Chill, Ajuste de desempenho). Os ajustes do Windows para jogos ficam na página Otimização.</p>
      <button class="btn" id="amd">${icon('link')}Baixar AMD Adrenalin</button>`;
    $('#amd', el)?.addEventListener('click', () => call('shell:open', 'https://www.amd.com/pt/support/download/drivers.html'));
    $('#profile', el).classList.add('hidden'); $('#limits', el).classList.add('hidden');
    return;
  }
  const pcieOk = info.pcieGen >= info.pcieGenMax || info.util < 20;
  const widthNote = info.pcieWidth < info.pcieWidthMax
    ? (/50[56]0|40[56]0|30[5]0|4060|5060/i.test(info.name) ? 'Esta placa usa só 8 linhas PCIe por projeto: x8 é normal.' : 'A placa está com menos linhas que o slot suporta. Confira se está no slot principal (o de cima) e se o slot não divide linhas com um SSD M.2.')
    : 'Largura máxima.';
  $('#info', el).innerHTML = `
    <div class="row between"><div><h2 style="margin:0">${esc(info.name)}</h2><div class="muted small">Driver ${esc(info.driver)} · VBIOS ${esc(info.vbios)} · estado ${esc(info.pstate)}</div></div>
      <button class="btn sm" id="drv">${icon('download')}Buscar Driver Novo</button></div>
    <div class="grid g4 mt">
      <div class="stat"><span class="label">Temperatura</span><span class="value">${fmt(info.temp)}<small>°C</small></span><span class="small muted">Ventoinha ${info.fan != null ? fmt(info.fan) + '%' : '—'}</span></div>
      <div class="stat"><span class="label">Uso</span><span class="value">${fmt(info.util)}<small>%</small></span><span class="small muted">VRAM ${fmt(info.vramUsed)} / ${fmt(info.vramTotal)} MB</span></div>
      <div class="stat"><span class="label">Clock</span><span class="value">${fmt(info.clock)}<small>MHz</small></span><span class="small muted">máx. ${fmt(info.clockMax)} · memória ${fmt(info.memClock)} MHz</span></div>
      <div class="stat"><span class="label">Potência</span><span class="value">${fmt(info.power)}<small>W</small></span><span class="small muted">limite ${fmt(info.powerLimit)} W (padrão ${fmt(info.powerDefault)})</span></div>
    </div>
    <div class="callout mt ${pcieOk ? '' : 'warn'}"><b>Link PCIe:</b> Gen ${fmt(info.pcieGen)} x${fmt(info.pcieWidth)} agora (máximo Gen ${fmt(info.pcieGenMax)} x${fmt(info.pcieWidthMax)}). ${widthNote}
      ${info.util < 20 ? ' Parada, a placa reduz a geração do PCIe para economizar energia: confira com um jogo aberto.' : (pcieOk ? '' : ' Em carga, a geração deveria estar no máximo: confira o slot e a opção PCIe na BIOS.')}</div>`;
  $('#drv', el).addEventListener('click', () => call('shell:open', 'https://www.nvidia.com/pt-br/drivers/'));

  // Perfil do driver
  const prof = await api.call('gpu:profileGet').catch((e) => ({ ok: false, error: e.message }));
  const pbox = $('#profile', el);
  if (!prof.ok) {
    pbox.innerHTML = `<h3>Perfil do Driver NVIDIA</h3><div class="callout warn">Não foi possível ler o perfil do driver: ${esc(prof.error)}</div>`;
  } else {
    const v = prof.values || {};
    pbox.innerHTML = `<h3>Perfil do Driver NVIDIA</h3><div class="sub">Mesmas opções do Painel de Controle da NVIDIA (configurações globais).</div>
      <div class="list">${prof.settings.map((s) => {
        const cur = v[String(s.id)];
        if (s.numeric) return `<div class="item"><div class="grow"><div class="title">${esc(s.title)}</div><div class="desc">${esc(s.help)}</div></div>
          <input type="number" min="0" max="1000" data-key="${s.key}" value="${cur || 0}" style="width:90px"></div>`;
        return `<div class="item"><div class="grow"><div class="title">${esc(s.title)}</div><div class="desc">${esc(s.help)}</div></div>
          <select data-key="${s.key}" style="width:210px">${s.options.map(([val, label]) => `<option value="${val >>> 0}" ${cur != null && (cur >>> 0) === (val >>> 0) ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          ${cur == null ? '<option value="" selected>Padrão do driver</option>' : ''}</select></div>`;
      }).join('')}</div>
      <div class="row mt"><button class="btn primary" id="hs">${icon('bolt')}Aplicar Perfil HS TECH</button><button class="btn" id="apply">Aplicar Escolhas</button><button class="btn ghost" id="reset">Restaurar Padrão</button></div>`;
    const readValues = () => {
      const out = {};
      pbox.querySelectorAll('[data-key]').forEach((i) => { out[i.dataset.key] = i.value === '' ? null : Number(i.value); });
      return out;
    };
    $('#apply', pbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await call('gpu:profileSet', readValues());
      toast(r.ok ? 'Perfil do driver atualizado. Reabra os jogos abertos.' : r.output, r.ok ? 'ok' : 'error', 7000);
      load(el);
    }));
    $('#hs', pbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const vals = {};
      prof.settings.forEach((s) => { if (s.hs != null) vals[s.key] = s.hs; });
      const r = await call('gpu:profileSet', vals);
      toast(r.ok ? 'Perfil HS TECH aplicado: desempenho máximo, baixa latência Ultra, filtragem em alto desempenho e otimização em threads.' : r.output, r.ok ? 'ok' : 'error', 8000);
      load(el);
    }));
    $('#reset', pbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const vals = {};
      prof.settings.forEach((s) => { vals[s.key] = null; });
      const r = await call('gpu:profileSet', vals);
      toast(r.ok ? 'Configurações restauradas ao padrão do driver.' : r.output, r.ok ? 'ok' : 'error');
      load(el);
    }));
  }

  // Limites
  const cfg = await api.call('gpu:config').catch(() => ({}));
  const lbox = $('#limits', el);
  const canPower = info.powerMin && info.powerMax && info.powerMax > info.powerMin;
  lbox.innerHTML = `<h3>Potência e Clock</h3><div class="sub">Os limites voltam ao padrão quando o PC reinicia. Marque a opção abaixo para o HS TECH reaplicar ao abrir.</div>
    <div class="small muted">Limite de potência: <b id="plv">${fmt(info.powerLimit)} W</b> (de ${fmt(info.powerMin)} a ${fmt(info.powerMax)} W)</div>
    <input type="range" id="pl" min="${info.powerMin || 0}" max="${info.powerMax || 0}" step="1" value="${info.powerLimit || 0}" style="width:100%" ${canPower ? '' : 'disabled'}>
    <div class="row"><button class="btn sm" id="plApply" ${canPower ? '' : 'disabled'}>Aplicar Limite</button><button class="btn sm ghost" id="plReset">Voltar ao Padrão (${fmt(info.powerDefault)} W)</button></div>
    ${canPower ? '' : '<div class="small muted mt">O BIOS desta placa não permite mudar o limite de potência.</div>'}
    <div class="small muted mt2">Limitar o clock máximo (MHz). Útil para reduzir temperatura e consumo com pouca perda de FPS, uma espécie de undervolt simplificado:</div>
    <div class="row mt"><input type="number" id="clk" placeholder="ex.: ${info.clockMax ? Math.round(info.clockMax * 0.9) : 2500}" value="${cfg.clockMax || ''}" style="width:130px"><button class="btn sm" id="clkApply">Travar Clock</button><button class="btn sm ghost" id="clkReset">Remover Trava</button></div>
    <label class="check mt"><input type="checkbox" id="onStart" ${cfg.applyOnStart ? 'checked' : ''}> Reaplicar potência e clock ao abrir o HS TECH</label>
    <div class="callout small mt">Quer mais desempenho (overclock)? Veja a página <b>Overclock seguro</b>.</div>`;
  const pl = $('#pl', lbox);
  pl.addEventListener('input', () => { $('#plv', lbox).textContent = `${pl.value} W`; });
  $('#plApply', lbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('gpu:powerLimit', Number(pl.value));
    toast(r.ok ? `Limite de potência: ${pl.value} W` : r.output, r.ok ? 'ok' : 'error', 8000);
  }));
  $('#plReset', lbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('gpu:powerLimit', info.powerDefault);
    await call('gpu:config', { powerLimit: null });
    toast(r.ok ? 'Limite de potência no padrão.' : r.output, r.ok ? 'ok' : 'error');
    load(el);
  }));
  $('#clkApply', lbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const v = Number($('#clk', lbox).value);
    if (!v || v < 300) { toast('Digite um clock em MHz', 'warn'); return; }
    const r = await call('gpu:lockClocks', v);
    toast(r.ok ? `Clock máximo travado em ${v} MHz.` : r.output, r.ok ? 'ok' : 'error', 8000);
  }));
  $('#clkReset', lbox).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call('gpu:lockClocks', 0);
    toast(r.ok ? 'Trava de clock removida.' : r.output, r.ok ? 'ok' : 'error');
    $('#clk', lbox).value = '';
  }));
  $('#onStart', lbox).addEventListener('change', (e) => call('gpu:config', { applyOnStart: e.target.checked }));
}

export function unmount() {}
