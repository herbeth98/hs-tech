// Ajustes de GPU: leitura pelo nvidia-smi, limite de potência/clock e perfil global do driver NVIDIA (NVAPI DRS).
const fs = require('fs');
const path = require('path');
const { runExe, psJson } = require('../ps');

// Obs.: monitor.js, hwmon.js e gpu.js leem o nvidia-smi cada um por conta própria (campos e intervalos diferentes). Correção de leitura da GPU: confira os três.
const SMI = 'nvidia-smi';
const FIELDS = [
  'name', 'driver_version', 'vbios_version', 'temperature.gpu', 'utilization.gpu', 'fan.speed', 'pstate',
  'power.draw', 'power.limit', 'power.default_limit', 'power.min_limit', 'power.max_limit',
  'clocks.gr', 'clocks.mem', 'clocks.max.gr', 'clocks.max.mem',
  'pcie.link.gen.current', 'pcie.link.gen.max', 'pcie.link.width.current', 'pcie.link.width.max',
  'memory.total', 'memory.used'
];

function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function nvidiaInfo() {
  const r = await runExe(SMI, [`--query-gpu=${FIELDS.join(',')}`, '--format=csv,noheader,nounits'], { timeout: 15000 });
  if (r.code !== 0) return null;
  const line = r.stdout.trim().split(/\r?\n/)[0];
  if (!line) return null;
  const v = line.split(',').map((s) => s.trim());
  const o = {};
  FIELDS.forEach((f, i) => { o[f] = v[i]; });
  return {
    name: o.name, driver: o.driver_version, vbios: o.vbios_version,
    temp: num(o['temperature.gpu']), util: num(o['utilization.gpu']), fan: num(o['fan.speed']), pstate: o.pstate,
    power: num(o['power.draw']), powerLimit: num(o['power.limit']), powerDefault: num(o['power.default_limit']),
    powerMin: num(o['power.min_limit']), powerMax: num(o['power.max_limit']),
    clock: num(o['clocks.gr']), memClock: num(o['clocks.mem']), clockMax: num(o['clocks.max.gr']), memClockMax: num(o['clocks.max.mem']),
    pcieGen: num(o['pcie.link.gen.current']), pcieGenMax: num(o['pcie.link.gen.max']),
    pcieWidth: num(o['pcie.link.width.current']), pcieWidthMax: num(o['pcie.link.width.max']),
    vramTotal: num(o['memory.total']), vramUsed: num(o['memory.used'])
  };
}

async function setPowerLimit(watts) {
  const r = await runExe(SMI, ['-pl', String(Math.round(watts))], { timeout: 20000 });
  return { ok: r.code === 0, output: (r.stdout + r.stderr).trim() };
}

async function lockClocks(maxMhz) {
  const r = maxMhz ? await runExe(SMI, ['-lgc', `0,${Math.round(maxMhz)}`], { timeout: 20000 }) : await runExe(SMI, ['-rgc'], { timeout: 20000 });
  return { ok: r.code === 0, output: (r.stdout + r.stderr).trim() };
}

// ---------------- Perfil global do driver NVIDIA via NVAPI (DRS) ----------------
const DRS_CS = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class Drs {
  [DllImport("nvapi64.dll", EntryPoint = "nvapi_QueryInterface", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr QI(uint id);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int D0();
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DOut(out IntPtr h);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int D1(IntPtr h);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DProf(IntPtr s, out IntPtr p);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DSet(IntPtr s, IntPtr p, IntPtr setting);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DGet(IntPtr s, IntPtr p, uint id, IntPtr setting);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DRestore(IntPtr s, IntPtr p, uint id);
  static T F<T>(uint id) { IntPtr p = QI(id); if (p == IntPtr.Zero) throw new Exception("NVAPI: funcao indisponivel 0x" + id.ToString("X")); return (T)(object)Marshal.GetDelegateForFunctionPointer(p, typeof(T)); }
  const int SIZE = 12320; const int OFF_ID = 4100, OFF_TYPE = 4104, OFF_CUR = 8220;
  static IntPtr session, profile;
  static void Open() {
    int r = F<D0>(0x0150E828)(); if (r != 0) throw new Exception("NvAPI_Initialize " + r);
    r = F<DOut>(0x0694D52E)(out session); if (r != 0) throw new Exception("CreateSession " + r);
    r = F<D1>(0x375DBD6B)(session); if (r != 0) throw new Exception("LoadSettings " + r);
    r = F<DProf>(0xDA8466A0)(session, out profile); if (r != 0) throw new Exception("GetBaseProfile " + r);
  }
  static void Close() { if (session != IntPtr.Zero) { F<D1>(0xDAD9CFF8)(session); session = IntPtr.Zero; } }
  public static Dictionary<string, object> Get(uint[] ids) {
    var res = new Dictionary<string, object>();
    Open();
    IntPtr buf = Marshal.AllocHGlobal(SIZE);
    try {
      foreach (uint id in ids) {
        for (int i = 0; i < SIZE; i++) Marshal.WriteByte(buf, i, 0);
        Marshal.WriteInt32(buf, 0, SIZE | (1 << 16));
        int r = F<DGet>(0x73BF8338)(session, profile, id, buf);
        if (r == 0) res[id.ToString()] = (uint)Marshal.ReadInt32(buf, OFF_CUR); else res[id.ToString()] = null;
      }
    } finally { Marshal.FreeHGlobal(buf); Close(); }
    return res;
  }
  public static string Set(uint[] ids, uint[] values) {
    Open();
    IntPtr buf = Marshal.AllocHGlobal(SIZE);
    try {
      for (int k = 0; k < ids.Length; k++) {
        for (int i = 0; i < SIZE; i++) Marshal.WriteByte(buf, i, 0);
        Marshal.WriteInt32(buf, 0, SIZE | (1 << 16));
        Marshal.WriteInt32(buf, OFF_ID, (int)ids[k]);
        Marshal.WriteInt32(buf, OFF_TYPE, 0);
        Marshal.WriteInt32(buf, OFF_CUR, (int)values[k]);
        int r = F<DSet>(0x577DD202)(session, profile, buf);
        if (r != 0) return "SetSetting 0x" + ids[k].ToString("X") + " falhou: " + r;
      }
      int s = F<D1>(0xFCBC7E14)(session);
      return s == 0 ? "OK" : "SaveSettings falhou: " + s;
    } finally { Marshal.FreeHGlobal(buf); Close(); }
  }
  public static string Restore(uint[] ids) {
    Open();
    try {
      foreach (uint id in ids) F<DRestore>(0x53F0381E)(session, profile, id);
      int s = F<D1>(0xFCBC7E14)(session);
      return s == 0 ? "OK" : "SaveSettings falhou: " + s;
    } finally { Close(); }
  }
}
'@
`;

// IDs públicos do NvApiDriverSettings.h e do NVIDIA Profile Inspector
const NV_SETTINGS = [
  { key: 'power', id: 0x1057EB71, title: 'Modo de gerenciamento de energia', help: 'Desempenho máximo mantém o clock alto e evita quedas de FPS quando a carga oscila.',
    options: [[0, 'Adaptável'], [5, 'Normal (padrão)'], [1, 'Preferir desempenho máximo']], hs: 1 },
  { key: 'latency', id: 0x0005F543, title: 'Modo de baixa latência', help: 'Ultra envia os frames na hora certa para a GPU. Se o jogo tem NVIDIA Reflex, use o Reflex no jogo.',
    options: [[0, 'Desligado'], [1, 'Ligado'], [2, 'Ultra']], hs: 2,
    also: { 2: [[0x10835000, 1], [0x007BA09E, 1]], 1: [[0x10835000, 0], [0x007BA09E, 1]], 0: [[0x10835000, 0], [0x007BA09E, 0]] } },
  { key: 'texture', id: 0x00CE2691, title: 'Filtragem de textura: qualidade', help: 'Alto desempenho ganha alguns FPS com perda visual mínima.',
    options: [[0xFFFFFFF6, 'Alta qualidade'], [0, 'Qualidade (padrão)'], [10, 'Desempenho'], [20, 'Alto desempenho']], hs: 20 },
  { key: 'threaded', id: 0x20C1221E, title: 'Otimização em threads', help: 'Distribui o trabalho do driver entre os núcleos da CPU.',
    options: [[0, 'Automático (padrão)'], [1, 'Ligado'], [2, 'Desligado']], hs: 1 },
  { key: 'vsync', id: 0x00A879CF, title: 'Sincronização vertical', help: 'Deixe o jogo decidir. Com G-SYNC, ligue o V-Sync aqui e desligue no jogo.',
    options: [[0x60925292, 'Usar a configuração do aplicativo'], [0x08416747, 'Forçar desligado'], [0x47814940, 'Forçar ligado']], hs: 0x60925292 },
  { key: 'fpscap', id: 0x10835002, title: 'Limite máximo de FPS (global)', help: 'Limitar o FPS um pouco abaixo da taxa do monitor estabiliza o frame time e reduz input lag com G-SYNC. 0 = sem limite.',
    numeric: true, hs: null }
];

async function nvProfileGet() {
  const ids = [...new Set(NV_SETTINGS.flatMap((s) => [s.id, ...Object.values(s.also || {}).flat().map((x) => x[0])]))];
  const script = `${DRS_CS}
try { $v = [Drs]::Get([uint32[]](${ids.join(',')})); @{ ok = $true; values = $v } | ConvertTo-Json -Compress } catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`;
  const r = await psJson(script);
  if (!r || !r.ok) return { ok: false, error: r ? r.error : 'Sem resposta', settings: NV_SETTINGS };
  return { ok: true, values: r.values, settings: NV_SETTINGS };
}

async function nvProfileSet(values) {
  // values: { key: number|null }  (null = restaurar padrão)
  const set = [];
  const restore = [];
  for (const s of NV_SETTINGS) {
    if (!(s.key in values)) continue;
    const v = values[s.key];
    if (v === null || v === undefined || (s.numeric && !v)) {
      restore.push(s.id);
      if (s.also) for (const [id] of Object.values(s.also)[0]) restore.push(id);
    } else {
      set.push([s.id, v >>> 0]);
      if (s.also && s.also[v]) for (const pair of s.also[v]) set.push(pair);
    }
  }
  let out = [];
  if (set.length) {
    const r = await psJson(`${DRS_CS}
try { @{ r = [Drs]::Set([uint32[]](${set.map((x) => x[0]).join(',')}), [uint32[]](${set.map((x) => x[1]).join(',')})) } | ConvertTo-Json -Compress } catch { @{ r = $_.Exception.Message } | ConvertTo-Json -Compress }`);
    out.push(r ? r.r : 'Sem resposta');
  }
  if (restore.length) {
    const r = await psJson(`${DRS_CS}
try { @{ r = [Drs]::Restore([uint32[]](${restore.join(',')})) } | ConvertTo-Json -Compress } catch { @{ r = $_.Exception.Message } | ConvertTo-Json -Compress }`);
    out.push(r ? r.r : 'Sem resposta');
  }
  const ok = out.every((x) => x === 'OK');
  return { ok, output: out.join(' · ') };
}

// ---------------- Configuração persistente (reaplicada ao abrir o app) ----------------
let cfgFile = null;
let cfg = { powerLimit: null, clockMax: null, applyOnStart: false };
function init(userDataDir) {
  cfgFile = path.join(userDataDir, 'gpu.json');
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch {}
}
function getConfig() { return cfg; }
function saveConfig(c) { cfg = { ...cfg, ...c }; if (cfgFile) fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)); return cfg; }
async function applyStartup() {
  if (!cfg.applyOnStart) return;
  if (cfg.powerLimit) await setPowerLimit(cfg.powerLimit);
  if (cfg.clockMax) await lockClocks(cfg.clockMax);
}

module.exports = { nvidiaInfo, setPowerLimit, lockClocks, nvProfileGet, nvProfileSet, NV_SETTINGS, init, getConfig, saveConfig, applyStartup };
