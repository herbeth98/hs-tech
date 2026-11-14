import { api, call, esc, fmt, icon, busy, toast, modal, logBox, drawLine, $ } from '../ui.js';
import { createGpuTest, cpuStress } from '../perf.js';

let off = [];
let stress = null;

function cpuAdvice(cpu) {
  const c = cpu || '';
  if (/Ryzen.*\d{4}X3D/i.test(c)) {
    const zen5 = /9\d{3}X3D/i.test(c);
    return {
      title: zen5 ? 'Ryzen X3D (Zen 5): PBO e Curve Optimizer liberados' : 'Ryzen X3D: multiplicador travado, Curve Optimizer liberado',
      level: 'info',
      text: zen5
        ? 'Os Ryzen 9000X3D aceitam PBO e Curve Optimizer. O ganho mais seguro é um Curve Optimizer negativo (undervolt por núcleo): mais clock sustentado com menos calor.'
        : 'Processadores X3D (5000/7000) não aceitam aumento de multiplicador, para proteger o cache 3D. O ganho seguro é o Curve Optimizer negativo na BIOS: a CPU segura clocks mais altos por mais tempo e esquenta menos.',
      steps: ['BIOS → Overclocking / AMD Overclocking → Precision Boost Overdrive → Advanced.', 'Curve Optimizer → All Cores → Negative → comece em 10.', 'Salve, rode o teste de estabilidade abaixo por 15 minutos e jogue normalmente por alguns dias.', 'Se estiver estável, tente 15 e depois 20. Se travar ou reiniciar, volte ao último valor estável.']
    };
  }
  if (/Ryzen/i.test(c)) {
    return {
      title: 'Ryzen: Precision Boost Overdrive (PBO) + Curve Optimizer', level: 'info',
      text: 'O jeito mais seguro de ganhar desempenho num Ryzen é o PBO (a própria CPU sobe o clock enquanto houver folga de temperatura e energia) junto com o Curve Optimizer negativo.',
      steps: ['BIOS → Precision Boost Overdrive → Enabled (ou Advanced → Motherboard limits).', 'Curve Optimizer → All Cores → Negative 10.', 'Rode o teste de estabilidade abaixo. Se ficar estável, tente 15 a 20.', 'Use um bom cooler: o PBO só sobe o clock se a temperatura deixar.']
    };
  }
  if (/i[3579]-1[34]\d{3}/i.test(c) || /Core.*1[34]\d{3}/i.test(c)) {
    return {
      title: 'Intel 13ª/14ª geração: NÃO faça overclock', level: 'bad',
      text: 'Os Core 13ª e 14ª geração (principalmente i7 e i9) tiveram um problema de degradação por tensão alta. O mais importante é atualizar a BIOS (microcódigo 0x12B ou mais novo) e usar o perfil "Intel Default Settings". Overclock aqui aumenta o risco de dano permanente.',
      steps: ['Atualize a BIOS da placa-mãe para a versão mais recente.', 'Na BIOS, escolha o perfil Intel Default Settings (ou Intel Baseline Profile).', 'Se quiser menos calor, faça undervolt leve (offset negativo) em vez de overclock.']
    };
  }
  if (/i[3579]-\d{4,5}K/i.test(c) || /Core.*K\b/i.test(c) || /Ultra.*K\b/i.test(c)) {
    return {
      title: 'Intel série K: multiplicador liberado', level: 'info',
      text: 'Processadores Intel "K" aceitam overclock pela BIOS ou pelo Intel XTU. Faça aos poucos: +100 MHz por vez, testando a estabilidade a cada passo e de olho na temperatura (até 85 °C em carga).',
      steps: ['Instale o Intel XTU ou use a BIOS.', 'Aumente o multiplicador de P-cores em 1 (100 MHz).', 'Rode o teste de estabilidade abaixo por 15 minutos.', 'Se passar, repita. Se travar, volte um passo.']
    };
  }
  return {
    title: 'Processador sem overclock por multiplicador', level: 'warn',
    text: 'Este processador não aceita overclock de multiplicador. O ganho seguro vem de: plano de energia HS TECH (CPU sempre no boost), boa refrigeração e memória com XMP/EXPO ativo.',
    steps: ['Ative o plano de energia HS TECH na página Otimização.', 'Ative o XMP/EXPO da memória (veja abaixo).', 'Limpe a poeira e confira a pasta térmica se a CPU passa de 90 °C.']
  };
}

export async function render(el) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Overclock Seguro</h1><p>Diagnóstico do que dá para ganhar no seu hardware, com passos seguros, e um teste de estabilidade que confere erros de cálculo na CPU e artefatos na GPU.</p></div></div>
  <div class="callout warn mb"><b>Leia antes:</b> overclock tira o hardware das especificações de fábrica. O HS TECH só aplica mudanças que o próprio hardware protege (limites de potência e perfis do fabricante) e mostra o passo a passo do resto. Sempre teste a estabilidade depois de qualquer mudança.</div>
  <div class="grid g3">
    <div class="card" id="cpuCard"><h3>Processador</h3><div class="muted">Lendo…</div></div>
    <div class="card" id="ramCard"><h3>Memória (XMP/EXPO)</h3><div class="muted">Lendo…</div></div>
    <div class="card" id="gpuCard"><h3>Placa de Vídeo</h3><div class="muted">Lendo…</div></div>
  </div>
  <div class="card mt"><div class="row between"><div><h3 style="margin:0">Teste de Estabilidade</h3><div class="sub" style="margin:4px 0 0">Carga máxima em todos os núcleos da CPU e na GPU. Para sozinho se a GPU passar de 90 °C.</div></div>
    <div class="row"><select id="dur"><option value="5">5 minutos</option><option value="10" selected>10 minutos</option><option value="15">15 minutos</option><option value="30">30 minutos</option></select>
    <label class="check"><input type="checkbox" id="useCpu" checked>CPU</label><label class="check"><input type="checkbox" id="useGpu" checked>GPU</label>
    <button class="btn primary" id="start">${icon('flame')}Iniciar Teste</button><button class="btn danger hidden" id="stop">${icon('stop')}Parar Teste</button></div></div>
    <div class="grid g4 mt">
      <div class="stat"><span class="label">Tempo</span><span class="value" id="t">—</span></div>
      <div class="stat"><span class="label">Erros CPU</span><span class="value" id="ec">—</span></div>
      <div class="stat"><span class="label">Erros GPU</span><span class="value" id="eg">—</span></div>
      <div class="stat"><span class="label">GPU máx.</span><span class="value" id="tg">—</span></div>
    </div>
    <div class="grid g2 mt"><div><canvas class="chart" id="tc"></canvas><div class="small muted">Temperatura da GPU (°C) e uso da CPU (%)</div></div><div id="gview" style="max-width:420px"></div></div>
    <div id="verdict" class="mt"></div>
  </div>`;

  const info = await call('sys:info').catch(() => ({}));
  const adv = cpuAdvice(info.cpu);
  $('#cpuCard', el).innerHTML = `<h3>Processador</h3><div class="small muted">${esc(info.cpu || '')}</div>
    <div class="row mt"><span class="badge ${adv.level === 'bad' ? 'bad' : adv.level === 'warn' ? 'warn' : 'info'}">${esc(adv.title)}</span></div>
    <p class="small">${esc(adv.text)}</p><ol class="small muted" style="padding-left:18px;margin:0;line-height:1.7">${adv.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;

  call('sys:xmp').then((x) => {
    $('#ramCard', el).innerHTML = `<h3>Memória (XMP/EXPO)</h3>
      <div class="row"><span class="badge ${x.verdict === 'warn' ? 'warn' : 'ok'}">${x.verdict === 'warn' ? 'Ganho disponível' : 'OK'}</span><span class="badge">${esc(x.typeName)} · ${fmt(x.configured)} MT/s</span></div>
      <p class="small">${esc(x.text)}</p><p class="small muted">${esc(x.channel)}</p>
      <p class="small muted">XMP/EXPO é o overclock mais seguro que existe: é um perfil testado pelo fabricante da memória. O ganho em jogos costuma ser de 5% a 15% no 1% low.</p>
      <button class="btn sm" id="xmpHow">Ver Como Ativar</button>`;
    $('#xmpHow', el).addEventListener('click', () => { location.hash = '#testes?tab=xmp'; });
  }).catch(() => {});

  api.call('gpu:info').then((g) => {
    const box = $('#gpuCard', el);
    if (!g) {
      box.innerHTML = `<h3>Placa de Vídeo</h3><p class="small">Para AMD, use o <b>AMD Software: Adrenalin</b> → Desempenho → Ajuste → <b>Overclock automático da GPU</b>. Ele testa e aplica sozinho.</p>`;
      return;
    }
    const head = g.powerMax && g.powerLimit < g.powerMax;
    box.innerHTML = `<h3>Placa de Vídeo</h3><div class="small muted">${esc(g.name)}</div>
      <p class="small"><b>1. Limite de potência no máximo</b>: deixa a placa manter o boost por mais tempo. A própria GPU continua protegida pelo limite de temperatura. Atual: ${fmt(g.powerLimit)} W, máximo: ${fmt(g.powerMax)} W.</p>
      <button class="btn sm" id="plMax" ${head ? '' : 'disabled'}>${head ? `Subir Potência para ${fmt(g.powerMax)} W` : 'Potência Já no Máximo'}</button>
      <p class="small mt"><b>2. Overclock automático (recomendado)</b>: o <b>NVIDIA App</b> tem o "Ajuste automático" (Desempenho → Ativar ajuste automático), que testa a sua placa e aplica um overclock estável sozinho. O <b>MSI Afterburner</b> tem o mesmo recurso (OC Scanner).</p>
      <div class="row"><button class="btn sm" id="nvApp">Abrir NVIDIA App</button><button class="btn sm" id="ab">${icon('download')}Instalar MSI Afterburner</button></div>`;
    $('#plMax', box)?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await call('gpu:powerLimit', g.powerMax);
      toast(r.ok ? `Limite de potência em ${g.powerMax} W.` : r.output, r.ok ? 'ok' : 'error', 8000);
    }));
    $('#nvApp', box).addEventListener('click', async () => { const s = await call('nvidia:status'); if (s.appExe) call('nvidia:openApp', s.appExe); else call('shell:open', 'https://www.nvidia.com/pt-br/software/nvidia-app/'); });
    $('#ab', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await call('winget:install', ['Guru3D.Afterburner'], 'oc');
      toast(r[0] && r[0].ok ? 'MSI Afterburner instalado.' : 'Não foi possível instalar o Afterburner.', r[0] && r[0].ok ? 'ok' : 'error');
    }, 'Instalando…'));
  }).catch(() => {});

  // Teste de estabilidade
  const series = { temp: [], cpu: [] };
  let maxTemp = 0;
  let gtest = null;
  let cstress = null;
  let timer = null;
  let t0 = 0;
  let durMs = 0;
  let errs = { cpu: 0, gpu: 0 };
  let stopReason = '';

  off.push(api.on('monitor:sample', (s) => {
    if (!stress || !el.isConnected) return;
    const temp = s.gpu && s.gpu.temp != null && !Number.isNaN(s.gpu.temp) ? s.gpu.temp : null;
    if (temp != null) { maxTemp = Math.max(maxTemp, temp); series.temp.push(temp); if (series.temp.length > 600) series.temp.shift(); }
    series.cpu.push(s.cpu); if (series.cpu.length > 600) series.cpu.shift();
    $('#tg', el).textContent = temp != null ? `${fmt(maxTemp)}°C` : '—';
    drawLine($('#tc', el), [series.temp, series.cpu], { max: 100, colors: ['error', 'primary'] });
    if (temp != null && temp >= 90) { stopReason = 'A GPU chegou a 90 °C. Teste parado para proteger a placa: melhore a ventilação antes de fazer overclock.'; finish(); }
  }));

  const finish = () => {
    if (!stress) return;
    stress = null;
    clearInterval(timer);
    if (gtest) { gtest.stop(); setTimeout(() => { if (gtest) { gtest.dispose(); gtest = null; } }, 300); }
    if (cstress) cstress.stop();
    $('#start', el).classList.remove('hidden'); $('#stop', el).classList.add('hidden');
    const elapsed = (performance.now() - t0) / 1000;
    const full = elapsed >= durMs / 1000 - 2;
    const ok = errs.cpu === 0 && errs.gpu === 0 && !stopReason && full;
    $('#verdict', el).innerHTML = `<div class="callout ${ok ? '' : 'danger'}"><b>${ok ? '✓ Estável' : stopReason ? 'Teste interrompido' : errs.cpu || errs.gpu ? '✗ Instável' : 'Teste parado antes do fim'}</b>: ${ok
      ? `${fmt(elapsed / 60, 1)} minutos sem nenhum erro de cálculo ou artefato. Temperatura máxima da GPU: ${fmt(maxTemp)} °C.`
      : stopReason || (errs.cpu || errs.gpu ? `${errs.cpu} erro(s) de cálculo na CPU e ${errs.gpu} artefato(s) na GPU. Desfaça o último ajuste de overclock (ou reduza o Curve Optimizer / clock) e teste de novo.` : 'Rode o teste até o fim para ter um resultado confiável.')}</div>`;
  };

  $('#stop', el).addEventListener('click', () => { stopReason = 'Parado por você.'; finish(); });
  $('#start', el).addEventListener('click', async () => {
    const useCpu = $('#useCpu', el).checked; const useGpu = $('#useGpu', el).checked;
    if (!useCpu && !useGpu) { toast('Escolha CPU, GPU ou os dois', 'warn'); return; }
    const ok = await modal({ title: 'Iniciar teste de estabilidade?', body: 'O PC vai ficar em carga máxima e esquentar (é normal). Salve seus trabalhos abertos. Se o PC travar ou reiniciar durante o teste, o último ajuste de overclock não está estável.', okText: 'Iniciar Teste' });
    if (!ok) return;
    call('monitor:start');
    durMs = Number($('#dur', el).value) * 60000;
    errs = { cpu: 0, gpu: 0 }; maxTemp = 0; stopReason = ''; series.temp = []; series.cpu = [];
    $('#verdict', el).innerHTML = '';
    $('#ec', el).textContent = '0'; $('#eg', el).textContent = '0';
    $('#start', el).classList.add('hidden'); $('#stop', el).classList.remove('hidden');
    stress = true;
    t0 = performance.now();
    timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      $('#t', el).textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      if (s * 1000 >= durMs) finish();
    }, 500);
    if (useCpu) {
      // Deixa uma thread livre para a GPU e a interface quando os dois rodam juntos
      cstress = cpuStress(durMs, (st) => { errs.cpu = st.errors; const e = $('#ec', el); if (e) { e.textContent = st.errors; e.style.color = st.errors ? 'var(--ui-error)' : ''; } });
    }
    if (useGpu) {
      gtest = createGpuTest($('#gview', el), 1920, 1080);
      gtest.stress(durMs, (st) => { errs.gpu = st.errors; const e = $('#eg', el); if (e) { e.textContent = st.errors; e.style.color = st.errors ? 'var(--ui-error)' : ''; } }).then(() => { if (stress && !useCpu) finish(); });
    }
    if (cstress) cstress.done.then(() => { if (stress) finish(); });
  });
  stress = null;
  unmountFns.push(() => { if (stress) { stopReason = 'Página fechada.'; finish(); } });
}

let unmountFns = [];
export function unmount() { off.forEach((f) => f()); off = []; unmountFns.forEach((f) => f()); unmountFns = []; }
