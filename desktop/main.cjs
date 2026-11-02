const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadSettings, mainNavigation, externalLink } = require('./policy.cjs');

let window, settings;
app.setName('OfficeX');
app.setAppUserModelId('OfficeX.Desktop');
app.setPath('userData', process.env.OFFICEX_DESKTOP_PROFILE || path.join(app.getPath('appData'), 'OfficeX Desktop'));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });

async function json(endpoint, options) {
  const result = await fetch(settings.origin + endpoint, { ...options, signal: AbortSignal.timeout(2500) });
  if (!result.ok) throw Error(`OfficeX returned HTTP ${result.status}.`);
  return result.json();
}
async function engineReady() {
  let health;
  try { health = await json('/api/health'); } catch { return false; }
  if (!health.ok) throw Error('Another program is using the OfficeX port.');
  const info = await json('/api/info');
  const actual = path.resolve(info.companyRoot || '').toLowerCase();
  const expected = path.resolve(settings.server.companyRoot).toLowerCase();
  if (actual !== expected || info.instanceName !== (settings.server.instanceName || 'OfficeX')) throw Error('This port belongs to a different OfficeX company. Check server.json.');
  return true;
}
async function startEngine() {
  if (await engineReady()) return;
  let failure;
  const child = spawn(settings.nodePath, [path.join(settings.sourceRoot, 'server', 'serve.mjs')], {
    cwd: settings.sourceRoot, detached: true, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, OFFICEX_CONFIG: settings.configFile },
  });
  child.on('error', (error) => { failure = error; });
  child.unref();
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (failure) throw failure;
    if (await engineReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error('OfficeX could not start. Check the server log in the app folder.');
}

function createWindow() {
  const icon = path.join(__dirname, 'officex.ico');
  window = new BrowserWindow({
    title: 'OfficeX', width: 1450, height: 940, minWidth: 900, minHeight: 650,
    backgroundColor: '#0f172a', autoHideMenuBar: true,
    icon: fs.existsSync(icon) ? icon : undefined,
    show: process.env.OFFICEX_DESKTOP_TEST !== '1',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.on('page-title-updated', (event) => { event.preventDefault(); window.setTitle('OfficeX'); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!mainNavigation(url, settings)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  ipcMain.on('officex:open-link', (event, value) => {
    if (event.sender !== window.webContents || !mainNavigation(event.senderFrame?.url || '', settings) || typeof value !== 'string' || !externalLink(value, settings)) return;
    void shell.openExternal(value).catch(() => {});
  });
  window.on('closed', () => { window = null; });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'OfficeX', submenu: [
      { label: 'Reload office', click: () => window?.reload() },
      { label: 'Open company folder', click: () => void shell.openPath(path.resolve(settings.server.companyRoot)) },
      { type: 'separator' },
      { label: 'Stop engine and quit', click: async () => { try { await json('/api/shutdown', { method: 'POST' }); app.quit(); } catch (e) { dialog.showErrorBox('OfficeX', e.message); } } },
      { label: 'Close desktop (engine keeps running)', role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
  void window.loadURL(settings.url).catch((error) => dialog.showErrorBox('OfficeX could not open', error.message));
}
if (lock) app.whenReady().then(async () => {
  try {
    settings = loadSettings(process.env.OFFICEX_DESKTOP_CONFIG || path.join(__dirname, 'instance.json'));
    await startEngine(); createWindow();
  } catch (error) { dialog.showErrorBox('OfficeX could not open', error.message); app.quit(); }
});
app.on('window-all-closed', () => app.quit());
