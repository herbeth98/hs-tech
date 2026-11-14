// Executores de PowerShell e de programas de linha de comando.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS_PRELUDE = `
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function RegGet($p, $n) { try { (Get-ItemProperty -LiteralPath $p -Name $n -ErrorAction Stop).$n } catch { $null } }
function RegSet($p, $n, $v, $t = 'DWord') {
  if (!(Test-Path -LiteralPath $p)) { New-Item -Path $p -Force | Out-Null }
  New-ItemProperty -LiteralPath $p -Name $n -Value $v -PropertyType $t -Force | Out-Null
}
function RegDel($p, $n) { Remove-ItemProperty -LiteralPath $p -Name $n -ErrorAction SilentlyContinue }
function PcfgAC($sub, $set) {
  $m = ([regex]'0x[0-9a-fA-F]{8}').Matches(((powercfg /q SCHEME_CURRENT $sub $set) -join ' '))
  if ($m.Count -lt 2) { return $null }
  [Convert]::ToInt32($m[$m.Count - 2].Value, 16)
}
`;

let counter = 0;

function decode(buf) {
  // sfc e alguns programas escrevem UTF-16 quando a saída é redirecionada.
  let zeros = 0;
  const n = Math.min(buf.length, 200);
  for (let i = 1; i < n; i += 2) if (buf[i] === 0) zeros++;
  if (n > 4 && zeros > n / 4) return buf.toString('utf16le').replace(/\u0000/g, '');
  return buf.toString('utf8');
}

function lineSplitter(onLine) {
  let pending = '';
  return {
    push(text) {
      pending += text;
      const parts = pending.split(/\r\n|\n|\r/);
      pending = parts.pop();
      for (const p of parts) if (p.trim()) onLine(p);
    },
    flush() {
      if (pending.trim()) onLine(pending);
      pending = '';
    }
  };
}

/** Executa um programa e transmite as linhas de saída. */
function runExe(exe, args = [], { onLine, cwd, timeout = 0, registry } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(exe, args, { cwd, windowsHide: true });
    if (registry) registry.add(child);
    const out = lineSplitter((l) => onLine && onLine(l));
    const err = lineSplitter((l) => onLine && onLine(l));
    child.stdout.on('data', (d) => { const t = decode(d); stdout += t; out.push(t); });
    child.stderr.on('data', (d) => { const t = decode(d); stderr += t; err.push(t); });
    let timer = null;
    if (timeout) timer = setTimeout(() => { try { child.kill(); } catch {} }, timeout);
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      if (registry) registry.delete(child);
      resolve({ code: -1, stdout, stderr: stderr + String(e.message) });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (registry) registry.delete(child);
      out.flush(); err.flush();
      resolve({ code, stdout, stderr });
    });
  });
}

/** Executa um script PowerShell gravado em arquivo temporário (evita problemas de aspas). */
async function runPS(script, opts = {}) {
  const file = path.join(os.tmpdir(), `hstech_${process.pid}_${Date.now()}_${counter++}.ps1`);
  fs.writeFileSync(file, '﻿' + PS_PRELUDE + '\n' + script, 'utf8');
  try {
    return await runExe('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], opts);
  } finally {
    fs.unlink(file, () => {});
  }
}

/** Executa um script que termina com ConvertTo-Json e devolve o objeto. */
async function psJson(script, opts = {}) {
  const r = await runPS(script, opts);
  const text = r.stdout.trim();
  const start = text.search(/[\[{]/);
  if (start < 0) {
    if (text === '' ) return null;
    throw new Error((r.stderr || text || 'Sem resposta do PowerShell').trim().slice(0, 800));
  }
  try {
    return JSON.parse(text.slice(start));
  } catch (e) {
    throw new Error('Resposta inválida do PowerShell: ' + text.slice(0, 400) + '\n' + r.stderr.slice(0, 400));
  }
}

module.exports = { runPS, psJson, runExe, lineSplitter, decode };
