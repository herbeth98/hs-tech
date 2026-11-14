// Worker de CPU/memória para benchmark e teste de estabilidade.
function unit(seed) {
  let h = (seed * 2654435761) | 0;
  let acc = 0;
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const cr = -2 + (x * 2.5) / 40 + seed * 1e-4;
      const ci = -1.25 + (y * 2.5) / 40;
      let zr = 0, zi = 0, i = 0;
      while (i < 64 && zr * zr + zi * zi < 4) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; i++; }
      acc += i;
    }
  }
  for (let i = 0; i < 16000; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h = (h + Math.imul(i, 0x9e3779b1)) | 0; }
  const a = new Int32Array(384);
  for (let i = 0; i < a.length; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; a[i] = h; }
  a.sort();
  let s = 0;
  for (let i = 0; i < 2000; i++) s += Math.sqrt(i + acc) * Math.sin(i * 0.001 + seed);
  return (acc ^ h ^ a[97] ^ ((s * 1000) | 0)) | 0;
}

function memBandwidth(ms) {
  const n = 8 * 1024 * 1024; // 64 MB por array
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i += 4096) a[i] = i;
  let bytes = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { b.set(a); a.set(b); bytes += n * 8 * 4; }
  return bytes / ((performance.now() - t0) / 1000) / 1e9; // GB/s (leitura + escrita)
}

self.onmessage = (e) => {
  const { cmd, ms, id } = e.data;
  if (cmd === 'cpu') {
    let units = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { unit(units & 15); units++; }
    self.postMessage({ id, units, secs: (performance.now() - t0) / 1000 });
  } else if (cmd === 'mem') {
    self.postMessage({ id, gbps: memBandwidth(ms) });
  } else if (cmd === 'stress') {
    const expected = new Int32Array(16);
    for (let k = 0; k < 16; k++) expected[k] = unit(k);
    let errors = 0, units = 0, last = performance.now();
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const k = units & 15;
      if (unit(k) !== expected[k]) errors++;
      units++;
      if (performance.now() - last > 1000) { self.postMessage({ id, progress: true, errors, units }); last = performance.now(); }
      if (self.__stop) break;
    }
    self.postMessage({ id, done: true, errors, units });
  }
};
