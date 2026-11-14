// Partes do benchmark que rodam no processo principal: disco e histórico de resultados.
const fs = require('fs');
const path = require('path');
const { runExe } = require('./ps');

async function diskWrite(dir, sizeMB = 1024, onProgress = () => {}) {
  const file = path.join(dir, `hstech_bench_${Date.now()}.tmp`);
  const chunk = Buffer.alloc(4 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i += 4) chunk.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
  const fd = fs.openSync(file, 'w');
  const total = sizeMB * 1024 * 1024;
  const t0 = performance.now();
  let written = 0;
  try {
    while (written < total) {
      fs.writeSync(fd, chunk);
      written += chunk.length;
      if (written % (64 * 1024 * 1024) === 0) onProgress(written / total);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const secs = (performance.now() - t0) / 1000;
  fs.rm(file, { force: true }, () => {});
  return (written / 1024 / 1024) / secs;
}

function parseWinsat(out) {
  const m = out.match(/Disk\s+\S+.*?\s([\d.,]+)\s*MB\/s/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

async function diskRead(letter = 'c') {
  const seq = await runExe('winsat', ['disk', '-seq', '-read', '-drive', letter], { timeout: 180000 });
  const ran = await runExe('winsat', ['disk', '-ran', '-read', '-drive', letter], { timeout: 180000 });
  return { seqRead: parseWinsat(seq.stdout), randRead: parseWinsat(ran.stdout) };
}

let histFile = null;
function init(userDataDir) { histFile = path.join(userDataDir, 'benchmarks.json'); }
function history() { try { return JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch { return []; } }
function saveResult(r) {
  const h = history();
  h.unshift(r);
  fs.writeFileSync(histFile, JSON.stringify(h.slice(0, 50), null, 2));
  return h;
}
function deleteResult(id) {
  const h = history().filter((x) => x.id !== id);
  fs.writeFileSync(histFile, JSON.stringify(h, null, 2));
  return h;
}

module.exports = { diskWrite, diskRead, init, history, saveResult, deleteResult };
