// Testes de desempenho e estabilidade usados pelo Benchmark e pelo Overclock seguro.
import { token } from './ui.js';
const WORKER_URL = new URL('./bench-worker.js', import.meta.url);

function runWorker(msg) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_URL);
    w.onmessage = (e) => { if (!e.data.progress) { resolve(e.data); w.terminate(); } };
    w.onerror = (e) => { reject(new Error(e.message)); w.terminate(); };
    w.postMessage(msg);
  });
}

export async function cpuSingle(ms = 6000) {
  const r = await runWorker({ cmd: 'cpu', ms });
  return r.units / r.secs; // unidades por segundo
}

export async function cpuMulti(ms = 8000) {
  const n = navigator.hardwareConcurrency || 4;
  const res = await Promise.all(Array.from({ length: n }, (_, id) => runWorker({ cmd: 'cpu', ms, id })));
  return res.reduce((a, r) => a + r.units / r.secs, 0);
}

export async function memory(ms = 3000) {
  const r = await runWorker({ cmd: 'mem', ms });
  return r.gbps;
}

// ---------------- GPU (WebGL2) ----------------
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
uniform vec2 res; uniform float t; uniform vec3 cA, cB, cBg; out vec4 o;
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float map(vec3 p){
  p.xz *= rot(t*0.3); p.xy *= rot(t*0.2);
  vec3 q = p;
  float d = 1e9;
  for(int i=0;i<7;i++){
    q = abs(q) - vec3(0.55, 0.45, 0.5);
    q.xy *= rot(0.7); q.yz *= rot(0.4);
    d = min(d, length(q) - 0.18);
  }
  return min(d, length(p) - 0.9 + 0.08*sin(8.0*p.x+t)*sin(8.0*p.y)*sin(8.0*p.z));
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.0015,0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*res) / res.y;
  vec3 ro = vec3(0.,0.,-3.2), rd = normalize(vec3(uv, 1.4));
  float d = 0.; vec3 col = cBg;
  for(int i=0;i<110;i++){
    vec3 p = ro + rd*d; float h = map(p);
    if(h < 0.0008){
      vec3 n = nrm(p); vec3 l = normalize(vec3(0.6,0.8,-0.5));
      float diff = max(dot(n,l),0.); float spec = pow(max(dot(reflect(-l,n),-rd),0.), 32.);
      col = mix(cA, cB, 0.5+0.5*n.y) * (0.15+diff) + spec;
      break;
    }
    d += h; if(d > 12.) break;
  }
  o = vec4(pow(col, vec3(0.4545)), 1.);
}`;

export function createGpuTest(container, width = 1920, height = 1080) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.style.cssText = 'width:100%;aspect-ratio:16/9;border-radius:var(--radius-lg);background:var(--ui-bg);display:block';
  container.innerHTML = '';
  container.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: true });
  if (!gl) throw new Error('WebGL2 indisponível');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'res');
  const uT = gl.getUniformLocation(prog, 't');
  gl.uniform2f(uRes, width, height);
  // Cores da cena vindas dos tokens do tema (convertidas para linear, o shader aplica gama no fim)
  const rgb = (name) => { const h = token(name).replace('#', ''); return [0, 2, 4].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2)); };
  gl.uniform3fv(gl.getUniformLocation(prog, 'cA'), rgb('color-green-400'));
  gl.uniform3fv(gl.getUniformLocation(prog, 'cB'), rgb('color-green-700'));
  gl.uniform3fv(gl.getUniformLocation(prog, 'cBg'), rgb('bg'));
  gl.viewport(0, 0, width, height);
  const px = new Uint8Array(4);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'desconhecido';

  function frame(time) {
    gl.uniform1f(uT, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function sync() { gl.readPixels(width >> 1, height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0] | (px[1] << 8) | (px[2] << 16); }
  const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  let stopped = false;
  return {
    renderer,
    stop() { stopped = true; },
    dispose() { stopped = true; const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); canvas.remove(); },
    /** Mede FPS por ms milissegundos. */
    async bench(ms, onFps) {
      stopped = false;
      for (let i = 0; i < 5; i++) { frame(i * 0.016); sync(); }
      let frames = 0; const t0 = performance.now(); let last = t0; let lastF = 0;
      while (!stopped && performance.now() - t0 < ms) {
        frame((performance.now() - t0) / 1000);
        frames++;
        if (frames % 2 === 0) sync();
        if (performance.now() - last > 500) { onFps && onFps(((frames - lastF) * 1000) / (performance.now() - last)); last = performance.now(); lastF = frames; await yieldNow(); }
      }
      sync();
      return (frames * 1000) / (performance.now() - t0);
    },
    /** Estresse com verificação de artefatos: um quadro fixo deve sempre dar o mesmo pixel. */
    async stress(ms, onTick) {
      stopped = false;
      frame(1.2345); const ref = sync();
      let frames = 0; let errors = 0; const t0 = performance.now(); let last = t0;
      while (!stopped && performance.now() - t0 < ms) {
        frame((performance.now() - t0) / 1000); frames++;
        if (frames % 40 === 0) { frame(1.2345); if (sync() !== ref) errors++; }
        else if (frames % 2 === 0) sync();
        if (performance.now() - last > 1000) { onTick && onTick({ frames, errors, elapsed: performance.now() - t0 }); last = performance.now(); await yieldNow(); }
      }
      return { frames, errors };
    }
  };
}

/** Estresse da CPU em todas as threads, com verificação dos cálculos. */
export function cpuStress(ms, onTick) {
  const n = navigator.hardwareConcurrency || 4;
  const workers = [];
  const state = Array.from({ length: n }, () => ({ errors: 0, units: 0 }));
  const done = Promise.all(Array.from({ length: n }, (_, id) => new Promise((resolve) => {
    const w = new Worker(WORKER_URL);
    workers.push(w);
    w.onmessage = (e) => {
      state[id] = { errors: e.data.errors, units: e.data.units };
      onTick && onTick(state.reduce((a, s) => ({ errors: a.errors + s.errors, units: a.units + s.units }), { errors: 0, units: 0 }));
      if (e.data.done) { w.terminate(); resolve(); }
    };
    w.onerror = () => { state[id].errors++; w.terminate(); resolve(); };
    w.postMessage({ cmd: 'stress', ms, id });
  })));
  return {
    done: done.then(() => state.reduce((a, s) => ({ errors: a.errors + s.errors, units: a.units + s.units }), { errors: 0, units: 0 })),
    stop() { workers.forEach((w) => w.terminate()); }
  };
}
