// Corner Lands as a desktop game (for Steam): the static web build in its own
// window, served from app://game/ so saves (localStorage), sound and fetch work
// as they do on the web. The game files are copied into game/ by
// `npm run build:desktop` in the repository root.
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'game');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// One copy at a time: a second launch brings the first window forward.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#2a1d12',
    title: 'Corner Lands',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // Links (credits, the store page) open in the player's own browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  // F11 or Alt+Enter: full screen on and off.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.loadURL('app://game/index.html');
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    // A file that is not there (music kept out of some builds) is a plain 404, which the game skips.
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  ipcMain.on('quit', () => app.quit());
  createWindow();
});

app.on('window-all-closed', () => app.quit());
