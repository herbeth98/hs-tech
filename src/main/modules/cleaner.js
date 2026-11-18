// Limpeza de arquivos temporários e caches.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { runPS, psJson, runExe } = require('../ps');

const env = process.env;
const LOCAL = env.LOCALAPPDATA || '';
const WIN = env.WINDIR || 'C:\\Windows';
const PROGRAMDATA = env.ProgramData || 'C:\\ProgramData';

function browserCaches(base) {
  // Perfis do Chromium: Default, Profile 1, ...
  const out = [];
  try {
    for (const prof of fs.readdirSync(base)) {
      if (prof !== 'Default' && !prof.startsWith('Profile')) continue;
      for (const sub of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker\\CacheStorage']) out.push(path.join(base, prof, sub));
    }
  } catch {}
  return out;
}

const CATEGORIES = [
  { id: 'usertemp', title: 'Temporários do usuário', desc: 'Pasta %TEMP%', checked: true, paths: () => [env.TEMP] },
  { id: 'wintemp', title: 'Temporários do Windows', desc: 'C:\\Windows\\Temp', checked: true, paths: () => [path.join(WIN, 'Temp')] },
  { id: 'wucache', title: 'Cache do Windows Update', desc: 'Downloads de atualizações já instaladas', checked: true, paths: () => [path.join(WIN, 'SoftwareDistribution', 'Download')], services: ['wuauserv', 'bits'] },
  { id: 'dumps', title: 'Despejos de memória e relatórios de erro', desc: 'Minidumps, CrashDumps e relatórios do WER', checked: true,
    paths: () => [path.join(WIN, 'Minidump'), path.join(LOCAL, 'CrashDumps'), path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER', 'ReportQueue')],
    files: () => [path.join(WIN, 'MEMORY.DMP')] },
  { id: 'thumbs', title: 'Cache de miniaturas', desc: 'O Explorer recria as miniaturas quando precisar', checked: false,
    files: () => { try { const d = path.join(LOCAL, 'Microsoft', 'Windows', 'Explorer'); return fs.readdirSync(d).filter((f) => /^(thumbcache|iconcache)_.*\.db$/i.test(f)).map((f) => path.join(d, f)); } catch { return []; } } },
  { id: 'shader', title: 'Cache de shaders (DirectX / NVIDIA / AMD)', desc: 'Os jogos recompilam na primeira execução', checked: false,
    paths: () => [path.join(LOCAL, 'D3DSCache'), path.join(LOCAL, 'NVIDIA', 'DXCache'), path.join(LOCAL, 'NVIDIA', 'GLCache'), path.join(LOCAL, 'AMD', 'DxCache'), path.join(LOCAL, 'AMD', 'DxcCache'), path.join(LOCAL, 'AMD', 'VkCache')] },
  { id: 'browsers', title: 'Cache dos navegadores', desc: 'Chrome, Edge e Brave (feche os navegadores antes)', checked: false,
    paths: () => [
      ...browserCaches(path.join(LOCAL, 'Google', 'Chrome', 'User Data')),
      ...browserCaches(path.join(LOCAL, 'Microsoft', 'Edge', 'User Data')),
      ...browserCaches(path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'))
    ] },
  { id: 'logs', title: 'Logs do Windows', desc: 'Logs antigos do CBS, DISM e instaladores', checked: true,
    paths: () => [path.join(WIN, 'Logs', 'CBS'), path.join(WIN, 'Logs', 'DISM'), path.join(WIN, 'Panther')], onlyExt: ['.log', '.cab', '.etl', '.txt'] },
  { id: 'prefetch', title: 'Prefetch', desc: 'O Windows recria com o uso; só limpe se tiver motivo', checked: false, paths: () => [path.join(WIN, 'Prefetch')] },
  { id: 'delivery', title: 'Otimização de Entrega', desc: 'Cache de atualizações compartilhadas na rede', checked: true, special: 'delivery' },
  { id: 'recycle', title: 'Lixeira', desc: 'Esvazia a Lixeira (não dá para desfazer)', checked: false, special: 'recycle' }
];

async function dirSize(p, onlyExt) {
  let total = 0;
  let count = 0;
  async function walk(d) {
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(full);
      else {
        if (onlyExt && !onlyExt.includes(path.extname(e.name).toLowerCase())) continue;
        try { const s = await fsp.stat(full); total += s.size; count++; } catch {}
      }
    }
  }
  await walk(p);
  return { total, count };
}

async function specialSize(kind) {
  if (kind === 'recycle') {
    const r = await psJson(`$s=0;$n=0;(New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $s += $_.Size; $n++ }; @{ total = [int64]$s; count = $n } | ConvertTo-Json -Compress`).catch(() => null);
    return r || { total: 0, count: 0 };
  }
  if (kind === 'delivery') {
    const r = await psJson(`$o = try { $c = Get-DeliveryOptimizationStatus -ErrorAction Stop | Measure-Object FileSize -Sum; @{ total = [int64]$c.Sum; count = [int]$c.Count } } catch { @{ total = 0; count = 0 } }; $o | ConvertTo-Json -Compress`).catch(() => null);
    return r || { total: 0, count: 0 };
  }
  return { total: 0, count: 0 };
}

async function scan() {
  const results = [];
  for (const c of CATEGORIES) {
    let total = 0;
    let count = 0;
    if (c.special) ({ total, count } = await specialSize(c.special));
    for (const p of (c.paths ? c.paths() : []).filter(Boolean)) {
      const s = await dirSize(p, c.onlyExt);
      total += s.total; count += s.count;
    }
    for (const f of c.files ? c.files() : []) {
      try { const s = await fsp.stat(f); total += s.size; count++; } catch {}
    }
    results.push({ id: c.id, title: c.title, desc: c.desc, checked: c.checked, bytes: total, files: count });
  }
  return results;
}

async function cleanDir(p, onlyExt, log) {
  let freed = 0;
  let failed = 0;
  let entries;
  try { entries = await fsp.readdir(p, { withFileTypes: true }); } catch { return { freed, failed }; }
  for (const e of entries) {
    const full = path.join(p, e.name);
    if (e.isDirectory() && !e.isSymbolicLink()) {
      if (onlyExt) { const r = await cleanDir(full, onlyExt, log); freed += r.freed; failed += r.failed; continue; }
      const s = await dirSize(full);
      try { await fsp.rm(full, { recursive: true, force: true }); freed += s.total; }
      catch {
        const r = await cleanDir(full, onlyExt, log); freed += r.freed; failed += r.failed + 1;
      }
    } else {
      if (onlyExt && !onlyExt.includes(path.extname(e.name).toLowerCase())) continue;
      let size = 0;
      try { size = (await fsp.stat(full)).size; } catch {}
      try { await fsp.rm(full, { force: true }); freed += size; } catch { failed++; }
    }
  }
  return { freed, failed };
}

// ids = 'safe' limpa as categorias marcadas por padrão (checked: true): é a "limpeza segura" usada pelo Boost e assistentes.
async function clean(ids, log = () => {}) {
  if (ids === 'safe') ids = CATEGORIES.filter((c) => c.checked).map((c) => c.id);
  let freed = 0;
  let failed = 0;
  for (const c of CATEGORIES.filter((x) => ids.includes(x.id))) {
    log(`Limpando: ${c.title}...`);
    if (c.services) await runPS(c.services.map((s) => `Stop-Service ${s} -Force -ErrorAction SilentlyContinue`).join('\n'));
    if (c.special === 'recycle') {
      const s = await specialSize('recycle');
      await runPS('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
      freed += s.total;
    }
    if (c.special === 'delivery') {
      const s = await specialSize('delivery');
      await runPS('Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue');
      freed += s.total;
    }
    for (const p of (c.paths ? c.paths() : []).filter(Boolean)) {
      const r = await cleanDir(p, c.onlyExt, log);
      freed += r.freed; failed += r.failed;
    }
    for (const f of c.files ? c.files() : []) {
      try { const s = await fsp.stat(f); await fsp.rm(f, { force: true }); freed += s.size; } catch { /* em uso */ }
    }
    if (c.services) await runPS(c.services.map((s) => `Start-Service ${s} -ErrorAction SilentlyContinue`).join('\n'));
  }
  await runExe('ipconfig', ['/flushdns']);
  log(`Concluído. ${(freed / 1024 ** 2).toFixed(0)} MB liberados${failed ? `, ${failed} itens em uso foram ignorados` : ''}. Cache DNS limpo.`);
  return { freed, failed };
}

module.exports = { scan, clean };
