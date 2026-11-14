// Processo principal do HS TECH.
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { runPS, runExe, psJson } = require('./ps');
const system = require('./modules/system');
const cleaner = require('./modules/cleaner');
const tweaks = require('./modules/tweaks');
const apps = require('./modules/apps');
const games = require('./modules/games');
const gpu = require('./modules/gpu');
const drivers = require('./modules/drivers');
const repair = require('./modules/repair');
const network = require('./modules/network');
const monitor = require('./modules/monitor');
const bench = require('./bench');
const diagnostico = require('./modules/diagnostico');
const memory = require('./modules/memory');
const hwmon = require('./modules/hwmon');

app.commandLine.appendSwitch('force_high_performance_gpu');
// Com o manifesto "requireAdministrator", o sandbox do processo de GPU do Chromium falha ao iniciar
// (GPU process launch failed: error_code=18). Só o sandbox da GPU é desligado; a interface carrega apenas arquivos locais.
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setAppUserModelId('com.hstech.optimizer');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(RENDERER, 'assets', 'icon.png');
const USER = app.getPath('userData');
const BIN = path.join(USER, 'bin');
const SETTINGS_FILE = path.join(USER, 'settings.json');

const DEFAULT_SETTINGS = {
  overlay: {
    position: 'top-left', scale: 1, opacity: 0.85, hotkey: 'Control+Shift+F10',
    show: { fps: true, low1: true, low01: false, frametime: true, graph: true, cpu: true, cpuClock: true, gpu: true, gpuTemp: true, vram: true, ram: true, ping: true, loss: true, speed: false, game: true, clock: true, power: true }
  },
  pingHost: '1.1.1.1',
  minimizeToTray: true,
  startHidden: false,
  gameWatcher: true,
  lastSpeed: null
};

let settings = loadSettings();
let win = null;
let overlay = null;
let tray = null;
let quitting = false;
let pingSession = null;
let sysInfo = null;
const procRegistry = new Map(); // escopo -> Set de processos filhos

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return { ...DEFAULT_SETTINGS, ...s, overlay: { ...DEFAULT_SETTINGS.overlay, ...(s.overlay || {}), show: { ...DEFAULT_SETTINGS.overlay.show, ...((s.overlay || {}).show || {}) } } };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}
function saveSettings() { fs.mkdirSync(USER, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); }

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function logger(scope) { return (line) => send('log', { scope, line }); }
function registry(scope) {
  if (!procRegistry.has(scope)) procRegistry.set(scope, new Set());
  return procRegistry.get(scope);
}

function isAdmin() {
  try { require('child_process').execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
}

// ---------------- Janelas ----------------
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1080, minHeight: 680,
    backgroundColor: '#020420' /* token --ui-bg (neutral-950 / navy) */, show: false, icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#020420', symbolColor: '#e2e8f0', height: 38 } /* --ui-bg e --ui-text */,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: false }
  });
  win.removeMenu();
  win.loadFile(path.join(RENDERER, 'index.html'));
  win.once('ready-to-show', () => { if (!(settings.startHidden && process.argv.includes('--hidden'))) win.show(); });
  win.on('close', (e) => {
    if (!quitting && settings.minimizeToTray) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function overlayBounds(w = 270, h = 300) {
  const d = screen.getPrimaryDisplay().bounds;
  const m = 12;
  const pos = settings.overlay.position;
  const x = pos.includes('right') ? d.x + d.width - w - m : d.x + m;
  const y = pos.includes('bottom') ? d.y + d.height - h - m : d.y + m;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

function createOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  overlay = new BrowserWindow({
    ...overlayBounds(), transparent: true, frame: false, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, fullscreenable: false,
    // sandbox: false igual à janela principal: no .exe elevado (requireAdministrator) o sandbox do Chromium
    // não sobe e o processo do overlay morre, deixando a janela transparente e vazia.
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  overlay.on('closed', () => { overlay = null; });
  // Diagnóstico do overlay em %APPDATA%\HS TECH\overlay.log
  const olog = (msg) => { try { fs.appendFileSync(path.join(USER, 'overlay.log'), `${new Date().toISOString()} ${msg}\n`); } catch {} };
  overlay.webContents.on('did-fail-load', (_e, code, desc, url) => olog(`did-fail-load ${code} ${desc} ${url}`));
  overlay.webContents.on('render-process-gone', (_e, d) => olog(`render-process-gone ${d.reason} ${d.exitCode}`));
  overlay.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2) olog(`console[${level}] ${message} (${path.basename(source || '')}:${line})`); });
  overlay.webContents.on('did-finish-load', () => olog(`did-finish-load bounds=${JSON.stringify(overlay.getBounds())}`));
  return overlay;
}

// Nomes curtos do hardware para os blocos do overlay ("AMD Ryzen 7 7800X3D 8-Core Processor" -> "Ryzen 7 7800X3D")
function shortName(n) {
  return String(n || '')
    .replace(/\(R\)|\(TM\)|®|™/gi, '')
    .replace(/\b\d+-Core Processor\b|\bProcessor\b|\bCPU\b.*$/i, '')
    .replace(/^(AMD|Intel|NVIDIA)\s+/i, '')
    .replace(/GeForce\s+/i, '')
    .replace(/\s*@.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function overlayConfig() {
  const gpus = (sysInfo && sysInfo.gpus) || [];
  const gpu = gpus.find((g) => /NVIDIA|Radeon RX|Arc/i.test(g.name)) || gpus[0] || {};
  return {
    ...settings.overlay,
    hw: { cpu: shortName(sysInfo && sysInfo.cpu) || 'CPU', gpu: shortName(gpu.name) || 'GPU', vram: gpu.vram || 0, ram: sysInfo ? sysInfo.ramTotal : 0 }
  };
}

function setOverlay(visible) {
  if (visible) {
    const o = createOverlay();
    o.webContents.once('did-finish-load', () => o.webContents.send('overlay:config', overlayConfig()));
    if (!o.webContents.isLoading()) o.webContents.send('overlay:config', overlayConfig());
    o.showInactive();
    ensureMonitor();
    ensurePing();
    if (monitor.presentMonPath(BIN)) monitor.startPresentMon();
  } else if (overlay && !overlay.isDestroyed()) {
    overlay.close();
    overlay = null;
  }
  send('overlay:state', !!(overlay && !overlay.isDestroyed()));
  updateTrayMenu();
  return !!overlay;
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  try { globalShortcut.register(settings.overlay.hotkey || 'Control+Shift+F10', () => setOverlay(!(overlay && !overlay.isDestroyed()))); } catch {}
}

function updateTrayMenu() {
  if (!tray) return;
  const on = !!(overlay && !overlay.isDestroyed());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir HS TECH', click: () => { win.show(); win.focus(); } },
    { label: on ? 'Esconder overlay' : 'Mostrar overlay', click: () => setOverlay(!on) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('HS TECH');
  tray.on('click', () => { win.show(); win.focus(); });
  updateTrayMenu();
}

// ---------------- Monitor ----------------
let monitorStarted = false;
function ensureMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const base = sysInfo ? sysInfo.cpuMaxMhz : 0;
  const nvidia = sysInfo ? (sysInfo.gpus || []).some((g) => /NVIDIA/i.test(g.name)) : true;
  monitor.start({
    baseMhz: base, nvidia,
    extra: () => ({ ping: pingSession ? pingSession.stats(30) : null, speed: settings.lastSpeed })
  });
  monitor.subscribe((s) => {
    send('monitor:sample', s);
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('monitor:sample', s);
  });
}

function ensurePing(host) {
  host = host || settings.pingHost || '1.1.1.1';
  if (pingSession && pingSession.host === host) return pingSession;
  if (pingSession) pingSession.stop();
  pingSession = new network.PingSession(host, (st) => send('ping:sample', st));
  pingSession.start();
  return pingSession;
}

// ---------------- IPC ----------------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
  });
}

function registerIpc() {
  // Sistema
  handle('app:info', async () => ({ admin: isAdmin(), userName: os.userInfo().username, version: app.getVersion(), userData: USER, platform: os.release(), settings }));
  handle('app:relaunchAdmin', async () => {
    const exe = process.execPath;
    const args = app.isPackaged ? [] : [path.join(__dirname, '..', '..')];
    const argList = args.map((a) => `'"${a}"'`).join(',');
    await runPS(`Start-Process -FilePath '${exe}' ${args.length ? `-ArgumentList ${argList}` : ''} -Verb RunAs`);
    quitting = true; app.quit();
  });
  handle('app:settings', async (patch) => {
    if (patch) {
      settings = { ...settings, ...patch, overlay: { ...settings.overlay, ...(patch.overlay || {}), show: { ...settings.overlay.show, ...((patch.overlay || {}).show || {}) } } };
      saveSettings();
      if (patch.overlay) {
        registerHotkey();
        if (overlay && !overlay.isDestroyed()) overlay.webContents.send('overlay:config', overlayConfig());
      }
      if (patch.pingHost && pingSession) ensurePing(patch.pingHost);
    }
    return settings;
  });
  handle('app:autostart', async (enable) => {
    const exe = process.execPath;
    const args = app.isPackaged ? '--hidden' : `"${path.join(__dirname, '..', '..')}" --hidden`;
    if (enable) {
      const r = await runPS(`
$a = New-ScheduledTaskAction -Execute '${exe.replace(/'/g, "''")}' -Argument '${args.replace(/'/g, "''")}'
$t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"
$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -RunLevel Highest -LogonType Interactive
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName 'HS TECH' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
Write-Output ok`);
      return r.code === 0;
    }
    await runPS(`Unregister-ScheduledTask -TaskName 'HS TECH' -Confirm:$false -ErrorAction SilentlyContinue`);
    return false;
  });
  handle('app:autostartStatus', async () => {
    const r = await runPS(`if (Get-ScheduledTask -TaskName 'HS TECH' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`);
    return r.stdout.trim() === 'yes';
  });
  handle('task:cancel', async (scope) => {
    const set = procRegistry.get(scope);
    if (set) for (const p of set) { try { require('child_process').execFileSync('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' }); } catch {} }
    if (scope === 'speed') network.cancelSpeedTest();
    return true;
  });
  handle('shell:open', async (url) => { if (/^(https?:|ms-settings:|steam:)/.test(url)) await shell.openExternal(url); return true; });
  handle('shell:openPath', async (p) => shell.openPath(p));
  handle('shell:showItem', async (p) => { shell.showItemInFolder(p); return true; });
  handle('shell:run', async (exe) => {
    const allowed = { rstrui: 'rstrui.exe', sysdm: 'SystemPropertiesProtection.exe', devmgmt: 'devmgmt.msc', powercfg: 'powercfg.cpl', taskmgr: 'taskmgr.exe', msconfig: 'msconfig.exe', windowsdefender: 'windowsdefender:', appwiz: 'appwiz.cpl', diskmgmt: 'diskmgmt.msc', resmon: 'resmon.exe' };
    if (!allowed[exe]) throw new Error('Comando não permitido');
    if (allowed[exe].endsWith(':')) await shell.openExternal(allowed[exe]); else require('child_process').exec(`start "" ${allowed[exe]}`, { windowsHide: true });
    return true;
  });
  handle('dialog:openExe', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Escolha o executável do jogo', filters: [{ name: 'Programas', extensions: ['exe'] }], properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:openDir', async (title) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Escolha uma pasta', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:saveFile', async ({ name, content }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled) return null;
    fs.writeFileSync(r.filePath, content);
    return r.filePath;
  });

  handle('sys:info', async (force) => { sysInfo = await system.getInfo(force); return sysInfo; });
  handle('sys:checkup', async () => system.checkup());
  handle('sys:xmp', async () => system.getXmp());
  handle('sys:extra', async () => system.getExtra());

  // Limpeza
  handle('clean:scan', async () => cleaner.scan());
  handle('clean:run', async (ids) => cleaner.clean(ids, logger('clean')));

  // Ajustes
  handle('tweaks:status', async () => tweaks.status());
  handle('tweaks:set', async (id, enable) => tweaks.set(id, enable, logger('tweaks')));
  handle('nvidia:status', async () => tweaks.nvidiaStatus());
  handle('nvidia:closeOverlay', async () => tweaks.nvidiaCloseOverlay());
  handle('nvidia:openApp', async (exe) => { if (exe && fs.existsSync(exe)) await shell.openPath(exe); return true; });
  handle('debloat:list', async () => tweaks.appxList());
  handle('debloat:remove', async (names) => tweaks.appxRemove(names, logger('debloat')));

  // Programas
  handle('apps:installed', async () => apps.installed());
  handle('apps:uninstall', async (entry) => apps.uninstall(entry));
  handle('startup:list', async () => apps.startupList());
  handle('startup:set', async (item, enabled) => apps.startupSet(item, enabled));
  handle('winget:catalog', async () => apps.catalog());
  handle('winget:available', async () => apps.wingetAvailable());
  handle('winget:installedIds', async () => apps.installedIds());
  handle('winget:install', async (ids, scope = 'install') => apps.install(ids, logger(scope), registry(scope)));
  handle('winget:upgradable', async () => apps.upgradable());
  handle('winget:upgrade', async (ids) => apps.upgrade(ids, logger('updates'), registry('updates')));
  handle('winget:upgradeAll', async () => apps.upgradeAll(logger('updates'), registry('updates')));

  // Jogos
  handle('games:scan', async (force) => games.scan(force));
  handle('games:topology', async () => ({ topo: await games.topology(), presets: games.AFFINITY_PRESETS }));
  handle('games:addManual', async (exe) => games.addManual(exe));
  handle('games:removeManual', async (id) => games.removeManual(id));
  handle('games:apply', async (game, s) => games.applySettings(game, s));
  handle('games:shortcut', async (game) => games.createShortcut(game, app.getPath('desktop')));
  handle('games:checkFolder', async (game) => games.checkFolder(game));
  handle('games:launch', async (game) => {
    if (game.appid) await shell.openExternal(`steam://rungameid/${game.appid}`);
    else if (game.exe) await shell.openPath(game.exe);
    return true;
  });
  handle('games:verify', async (game) => { if (game.appid) await shell.openExternal(`steam://validate/${game.appid}`); return !!game.appid; });

  // GPU
  handle('gpu:info', async () => gpu.nvidiaInfo());
  handle('gpu:powerLimit', async (w) => { const r = await gpu.setPowerLimit(w); if (r.ok) gpu.saveConfig({ powerLimit: w }); return r; });
  handle('gpu:lockClocks', async (mhz) => { const r = await gpu.lockClocks(mhz); if (r.ok) gpu.saveConfig({ clockMax: mhz || null }); return r; });
  handle('gpu:config', async (c) => (c ? gpu.saveConfig(c) : gpu.getConfig()));
  handle('gpu:profileGet', async () => gpu.nvProfileGet());
  handle('gpu:profileSet', async (values) => gpu.nvProfileSet(values));

  // Drivers
  handle('drivers:list', async () => drivers.list());
  handle('drivers:search', async () => drivers.searchUpdates());
  handle('drivers:install', async (ids) => drivers.installUpdates(ids, logger('drivers')));
  handle('drivers:backup', async (dest) => drivers.backup(dest, logger('drivers')));
  handle('drivers:rescan', async () => drivers.rescan());

  // Hardware Monitor (sensores a cada 1 s enquanto a página está aberta)
  handle('hw:start', async () => {
    const topo = await games.topology().catch(() => null);
    const name = sysInfo ? sysInfo.cpu : (topo ? topo.cpu : 'Processador');
    return hwmon.start(topo, name, (s) => send('hw:sample', s));
  });
  handle('hw:stop', async () => { hwmon.stop(); return true; });

  // Limpeza da memória RAM
  handle('mem:clean', async () => memory.clean());

  // Diagnóstico de desligamentos e travamentos
  handle('diag:run', async (days) => diagnostico.run(days || 30));
  handle('diag:reliability', async () => diagnostico.openReliability());

  // Reparo
  handle('repair:list', async () => repair.list());
  handle('repair:run', async (id) => repair.run(id, logger('repair'), registry('repair')));
  handle('restore:create', async (desc, scope = 'repair') => repair.createRestorePoint(desc, logger(scope)));
  handle('restore:list', async () => repair.listRestorePoints());

  // Rede
  handle('ping:start', async (host) => { ensureMonitor(); return ensurePing(host).stats(); });
  handle('ping:stop', async () => { if (pingSession && !(overlay && !overlay.isDestroyed())) { pingSession.stop(); pingSession = null; } return true; });
  handle('ping:stats', async () => (pingSession ? pingSession.stats() : null));
  handle('speed:run', async () => {
    const r = await network.speedTest((p) => send('speed:progress', p));
    settings.lastSpeed = r; saveSettings();
    return r;
  });

  // Monitor / overlay
  handle('monitor:start', async () => { ensureMonitor(); return true; });
  handle('overlay:toggle', async (v) => setOverlay(typeof v === 'boolean' ? v : !(overlay && !overlay.isDestroyed())));
  handle('overlay:state', async () => !!(overlay && !overlay.isDestroyed()));
  handle('fps:status', async () => ({ installed: !!monitor.presentMonPath(BIN), running: monitor.isPresentMonRunning() }));
  handle('fps:download', async () => monitor.downloadPresentMon(BIN, (p) => send('fps:download', p)));
  handle('fps:start', async () => { ensureMonitor(); return monitor.startPresentMon(); });
  handle('fps:stop', async () => { monitor.stopPresentMon(); return true; });

  // Benchmark
  handle('bench:diskWrite', async (dir) => bench.diskWrite(dir || os.tmpdir(), 1024, (p) => send('bench:disk', p)));
  handle('bench:diskRead', async (letter) => bench.diskRead(letter));
  handle('bench:history', async () => bench.history());
  handle('bench:save', async (r) => bench.saveResult(r));
  handle('bench:delete', async (id) => bench.deleteResult(id));

  ipcMain.on('overlay:resize', (_e, { width, height }) => {
    if (overlay && !overlay.isDestroyed()) overlay.setBounds(overlayBounds(width, height));
  });
}

// ---------------- Autoteste (só para desenvolvimento) ----------------
// HSTECH_SELFTEST=<pasta> abre cada página, salva uma captura e o console, e fecha.
async function selfTest(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'console.log');
  fs.writeFileSync(logFile, '');
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    fs.appendFileSync(logFile, `[${level}] ${message} (${path.basename(source || '')}:${line})\n`);
  });
  const pages = (process.env.HSTECH_PAGES || 'painel,checkup,otimizacao,limpeza,jogos,gpu,overclock,programas,inicializacao,debloat,drivers,windows-novo,reparo,monitor,rede,testes,benchmark,config').split(',');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
  win.setSize(1440, Number(process.env.HSTECH_H) || 900);
  // Janela de teste fora da tela e sem receber cliques reais (não atrapalha quem está usando o PC)
  if (!process.env.HSTECH_VISIBLE) { win.unmaximize(); win.setPosition(-5000, 0); win.setIgnoreMouseEvents(!process.env.HSTECH_MOUSETEST); }
  if (process.env.HSTECH_SPLASH) {
    // Quadros da abertura e da entrada coreografada
    let tPrev = 0;
    for (const t of [400, 1000, 1600, 2150, 2700]) {
      await wait(t - tPrev); tPrev = t;
      fs.writeFileSync(path.join(dir, `splash-${t}ms.png`), (await win.webContents.capturePage()).toPNG());
    }
    await wait(1500);
  }
  if (process.env.HSTECH_MOUSETEST) {
    // Fundo interativo: move o mouse por 4 s, clica, mede CPU em movimento e parado
    await win.webContents.executeJavaScript(`location.hash = '#config'`);
    await wait(5000);
    const cpu = () => app.getAppMetrics().reduce((a, m) => a + (m.cpu ? m.cpu.percentCPUUsage : 0), 0);
    cpu(); await wait(3000);
    const idle = cpu();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 4000) {
      const k = (Date.now() - t0) / 4000;
      const x = Math.round(300 + 900 * k), y = Math.round(200 + 400 * Math.sin(k * Math.PI));
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      if (i++ === 60) fs.writeFileSync(path.join(dir, 'mouse-mid.png'), (await win.webContents.capturePage()).toPNG());
      await wait(16);
    }
    const moving = cpu();
    win.webContents.sendInputEvent({ type: 'mouseDown', x: 1000, y: 650, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: 1000, y: 650, button: 'left', clickCount: 1 });
    await wait(120);
    fs.writeFileSync(path.join(dir, 'mouse-click.png'), (await win.webContents.capturePage()).toPNG());
    await wait(3000); cpu(); await wait(3000);
    const after = cpu();
    fs.appendFileSync(logFile, `cpu parado(antes)=${idle.toFixed(1)}% movendo=${moving.toFixed(1)}% parado(depois)=${after.toFixed(1)}%\n`);
  }
  if (process.env.HSTECH_EVAL) setTimeout(() => win.webContents.executeJavaScript(process.env.HSTECH_EVAL).catch(() => {}), 4000);
  if (process.env.HSTECH_NOBG) {
    await win.webContents.executeJavaScript(`document.querySelector('.app-bg').style.display = 'none'`);
  }
  if (process.env.HSTECH_NAVTEST) {
    // Confere se o indicador do menu fica exatamente sobre o item ativo em todas as páginas
    await wait(2600);
    const ids = await win.webContents.executeJavaScript(`[...document.querySelectorAll('#sidebar a[data-page]')].map((a) => a.dataset.page)`);
    for (const id of ids) {
      await win.webContents.executeJavaScript(`location.hash = '#${id}'`);
      await wait(900);
      const r = await win.webContents.executeJavaScript(`(() => { const a = document.querySelector('#sidebar a.active'); const i = document.querySelector('.nav-indicator');
        const ra = a.getBoundingClientRect(), ri = i.getBoundingClientRect(); return { page: a.dataset.page, dy: Math.round(ri.top - ra.top), dh: Math.round(ri.height - ra.height) }; })()`);
      fs.appendFileSync(logFile, `nav ${r.page.padEnd(14)} dy=${r.dy} dh=${r.dh}${Math.abs(r.dy) > 1 || Math.abs(r.dh) > 1 ? '  <-- ERRADO' : ''}\n`);
    }
    fs.writeFileSync(path.join(dir, 'nav-final.png'), (await win.webContents.capturePage()).toPNG());
  }
  for (const p of pages) {
    await win.webContents.executeJavaScript(`location.hash = '#${p}'`);
    await wait(Number(process.env.HSTECH_WAIT || 9000));
    if (p === 'benchmark' && process.env.HSTECH_BENCH) {
      await win.webContents.executeJavaScript(`document.getElementById('run').click()`);
      await wait(Number(process.env.HSTECH_BENCH));
    }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${p}.png`), img.toPNG());
    const dbg = await win.webContents.executeJavaScript(`(() => { const m = document.getElementById('main'); return 'scrollTop=' + m.scrollTop + ' scrollH=' + m.scrollHeight + ' active=' + (document.activeElement && (document.activeElement.tagName + '#' + document.activeElement.id)) + ' fonte=' + [...document.fonts].filter(f => f.family.includes('Public Sans')).map(f => f.status).join(','); })()`);
    fs.appendFileSync(logFile, `--- capturada: ${p} ${dbg}\n`);
  }
  if (process.env.HSTECH_FBTEST) {
    // Feedback de botões: clique (andamento), conclusão, falha simulada e toasts
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => fs.writeFileSync(path.join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    await js(`location.hash = '#limpeza'`);
    await wait(12000);
    await js(`(() => { const b = document.getElementById('scan'); const r = b.getBoundingClientRect();
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 30, clientY: r.top + r.height / 2 })); b.click(); })()`);
    await wait(150); await shot('fb-1-clique');
    for (let i = 0; i < 60; i++) { if (await js(`document.getElementById('scan').classList.contains('state-done')`)) break; await wait(250); }
    await wait(200); await shot('fb-2-concluido');
    await js(`import('./js/ui.js').then((m) => { const b = document.getElementById('clean'); m.busy(b, async () => { await new Promise((r) => setTimeout(r, 300)); throw new Error('falha simulada'); }, 'Limpando…').catch(() => {}); })`);
    await wait(900); await shot('fb-3-falha');
    await js(`import('./js/ui.js').then((m) => { m.toast('Plano de Energia HS TECH aplicado', 'ok', 20000); m.toast('Marque pelo menos uma categoria', 'warn', 20000); m.toast('Análise de 30 dias concluída: 5 achados', 'info', 20000); })`);
    await wait(600); await shot('fb-4-toasts');
    fs.appendFileSync(logFile, '--- fbtest ok\n');
  }
  if (process.env.HSTECH_OVERLAY) {
    setOverlay(true);
    await wait(Math.max(8000, Number(process.env.HSTECH_OVERLAY) || 0));
    const txt = await overlay.webContents.executeJavaScript(`document.getElementById('box').innerText + ' | [fonte overlay: ' + [...document.fonts].filter(f => f.family.includes('Public Sans')).map(f => f.status).join(',') + ']'`);
    fs.appendFileSync(logFile, `--- overlay:\n${txt}\n--- bounds: ${JSON.stringify(overlay.getBounds())}\n`);
    const img = await overlay.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'overlay.png'), img.toPNG());
  }
  quitting = true;
  app.quit();
}

// ---------------- Inicialização ----------------
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
  fs.mkdirSync(USER, { recursive: true });
  games.init(USER);
  gpu.init(USER);
  bench.init(USER);
  registerIpc();
  createWindow();
  createTray();
  registerHotkey();
  system.getInfo().then((i) => { sysInfo = i; }).catch(() => {});
  if (process.env.HSTECH_SELFTEST) selfTest(process.env.HSTECH_SELFTEST);
  gpu.applyStartup().catch(() => {});
  if (settings.gameWatcher) games.startWatcher((ev) => send('games:applied', ev));
});

app.on('before-quit', () => { quitting = true; monitor.stop(); hwmon.stop(); if (pingSession) pingSession.stop(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
