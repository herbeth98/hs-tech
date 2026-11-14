// Ping contínuo (latência, jitter, perda de pacotes) e teste de velocidade (Cloudflare).
const { spawn } = require('child_process');
const { decode, lineSplitter } = require('../ps');

class PingSession {
  constructor(host, onSample) {
    this.host = host;
    this.onSample = onSample;
    this.samples = []; // { t, ms|null }
    this.sent = 0;
    this.lost = 0;
    this.proc = null;
  }
  start() {
    this.proc = spawn('ping', ['-t', '-w', '1000', this.host], { windowsHide: true });
    const sp = lineSplitter((line) => this.parse(line));
    this.proc.stdout.on('data', (d) => sp.push(decode(d)));
    this.proc.on('close', () => { this.proc = null; });
  }
  parse(line) {
    const ms = line.match(/(?:tempo|time)\s*[=<]\s*(\d+)\s*ms/i);
    let value;
    if (ms) value = Number(ms[1]);
    else if (/esgotado|timed out|inacess[ií]vel|unreachable|falha geral|general failure|transmit failed|falha na transmiss/i.test(line)) value = null;
    else return;
    this.sent++;
    if (value === null) this.lost++;
    this.samples.push({ t: Date.now(), ms: value });
    if (this.samples.length > 600) this.samples.shift();
    this.onSample && this.onSample(this.stats());
  }
  stats(windowSec = 60) {
    const since = Date.now() - windowSec * 1000;
    const recent = this.samples.filter((s) => s.t >= since);
    const ok = recent.filter((s) => s.ms !== null).map((s) => s.ms);
    const lostRecent = recent.length - ok.length;
    let jitter = 0;
    for (let i = 1; i < ok.length; i++) jitter += Math.abs(ok[i] - ok[i - 1]);
    jitter = ok.length > 1 ? jitter / (ok.length - 1) : 0;
    const last = this.samples[this.samples.length - 1];
    return {
      host: this.host,
      last: last ? last.ms : null,
      avg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
      min: ok.length ? Math.min(...ok) : null,
      max: ok.length ? Math.max(...ok) : null,
      jitter,
      lossPct: recent.length ? (lostRecent / recent.length) * 100 : 0,
      sent: this.sent,
      lost: this.lost,
      totalLossPct: this.sent ? (this.lost / this.sent) * 100 : 0,
      history: this.samples.slice(-120).map((s) => s.ms)
    };
  }
  stop() { if (this.proc) { try { this.proc.kill(); } catch {} this.proc = null; } }
}

// ---------------- Teste de velocidade ----------------
const CF = 'https://speed.cloudflare.com';

async function measureLatency(n = 14) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${CF}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' });
      await r.arrayBuffer();
      let ms = performance.now() - t0;
      // Desconta o tempo de processamento informado pelo servidor (server-timing: cfRequestDuration;dur=X)
      const st = r.headers.get('server-timing') || '';
      const dur = parseFloat((st.match(/dur=([\d.]+)/) || [])[1]);
      if (dur > 0 && dur < ms) ms -= dur;
      if (i > 0) seq.push(ms); // a primeira inclui a conexão TLS
    } catch {}
  }
  let jitter = 0;
  for (let i = 1; i < seq.length; i++) jitter += Math.abs(seq[i] - seq[i - 1]);
  const sorted = [...seq].sort((a, b) => a - b);
  return { ping: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, jitter: seq.length > 1 ? jitter / (seq.length - 1) : null };
}

async function measureDownload(seconds, streams, onProgress, signal) {
  let bytes = 0;
  const start = performance.now();
  const deadline = start + seconds * 1000;
  async function worker() {
    while (performance.now() < deadline && !signal.aborted) {
      try {
        const r = await fetch(`${CF}/__down?bytes=50000000&r=${Math.random()}`, { cache: 'no-store', signal });
        const reader = r.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (performance.now() >= deadline) { try { await reader.cancel(); } catch {} break; }
        }
      } catch { if (signal.aborted) return; await new Promise((r) => setTimeout(r, 200)); }
    }
  }
  const timer = setInterval(() => {
    const s = (performance.now() - start) / 1000;
    onProgress((bytes * 8) / s / 1e6, Math.min(1, s / seconds));
  }, 250);
  await Promise.all(Array.from({ length: streams }, worker));
  clearInterval(timer);
  return (bytes * 8) / ((performance.now() - start) / 1000) / 1e6;
}

async function measureUpload(seconds, streams, onProgress, signal) {
  let bytes = 0;
  const start = performance.now();
  const deadline = start + seconds * 1000;
  const chunk = Buffer.alloc(4 * 1024 * 1024, 7);
  async function worker() {
    while (performance.now() < deadline && !signal.aborted) {
      try {
        const r = await fetch(`${CF}/__up?r=${Math.random()}`, { method: 'POST', body: chunk, signal, headers: { 'Content-Type': 'application/octet-stream' } });
        await r.arrayBuffer();
        bytes += chunk.length;
      } catch { if (signal.aborted) return; await new Promise((r) => setTimeout(r, 200)); }
    }
  }
  const timer = setInterval(() => {
    const s = (performance.now() - start) / 1000;
    onProgress((bytes * 8) / s / 1e6, Math.min(1, s / seconds));
  }, 250);
  await Promise.all(Array.from({ length: streams }, worker));
  clearInterval(timer);
  return (bytes * 8) / ((performance.now() - start) / 1000) / 1e6;
}

let speedAbort = null;

async function speedTest(onProgress = () => {}) {
  if (speedAbort) speedAbort.abort();
  speedAbort = new AbortController();
  const signal = speedAbort.signal;
  onProgress({ phase: 'ping' });
  const lat = await measureLatency();
  onProgress({ phase: 'ping', ...lat, done: true });
  const down = await measureDownload(10, 6, (mbps, p) => onProgress({ phase: 'download', mbps, progress: p }), signal);
  onProgress({ phase: 'download', mbps: down, progress: 1, done: true });
  const up = await measureUpload(8, 4, (mbps, p) => onProgress({ phase: 'upload', mbps, progress: p }), signal);
  onProgress({ phase: 'upload', mbps: up, progress: 1, done: true });
  speedAbort = null;
  return { ping: lat.ping, jitter: lat.jitter, download: down, upload: up, date: new Date().toISOString(), server: 'Cloudflare' };
}

function cancelSpeedTest() { if (speedAbort) speedAbort.abort(); }

module.exports = { PingSession, speedTest, cancelSpeedTest };
