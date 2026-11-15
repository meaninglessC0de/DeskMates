import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, shell, systemPreferences } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TrayAction } from '../shared/shell';
import { APP_NAME, CH, RESOURCES, TEST_MODE } from './constants';
import { LOG_PATH, killOfficeNow, officePid, officeUrl, startOffice, stopOffice } from './office';
import { notify, recorded, type NotifyArgs } from './notify';
import { clickTrayItem, createTray, trayLabels, updateTray, type TrayRow } from './tray';

app.setName(APP_NAME);

const ICON_PATH = join(RESOURCES, 'icon.png');

// In development the Dock shows the Electron logo; swap in the Deskmates icon. A missing file never crashes.
function setDockIcon(): void {
  try {
    if (process.platform !== 'darwin' || app.isPackaged || !existsSync(ICON_PATH)) return;
    const img = nativeImage.createFromPath(ICON_PATH);
    if (!img.isEmpty()) app.dock?.setIcon(img);
  } catch {
    /* the default icon stays */
  }
}

let win: BrowserWindow | null = null;
let quitting = false;
let cleanedUp = false;
let badgeText = '';

// The top bars are draggable, everything interactive inside them is not. The sidebar header gets the
// inset the traffic lights need. Injected after every load (R17); none of this exists in a browser tab.
const DRAG_CSS = `
nav.astryx-side-nav > :first-child { -webkit-app-region: drag; padding-top: 28px; box-sizing: content-box; }
.astryx-layout-header { -webkit-app-region: drag; }
dialog .astryx-layout-header, dialog.astryx-drawer .astryx-layout-header { -webkit-app-region: no-drag; }
button, a, input, textarea, select, summary, [role="button"], [role="menuitem"], [role="tab"],
[role="switch"], [role="checkbox"], [role="separator"], [contenteditable="true"] { -webkit-app-region: no-drag; }
`;

function showWindow(): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  app.focus({ steal: true });
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const trayDeps = {
  showWindow,
  sendAction: (a: TrayAction) => send(CH.trayAction, a),
};

function clickNotification(employeeId: string): void {
  showWindow();
  send(CH.notificationClick, employeeId);
}

function createWindow(url: string | null, file: { path: string; shot: string } | null): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    icon: ICON_PATH,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // electron-vite emits the preload as an ES module (index.mjs), which a sandboxed preload cannot load
      backgroundThrottling: false,
      preload: join(import.meta.dirname, '../preload/index.mjs'),
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.on('did-finish-load', () => {
    void win?.webContents.insertCSS(DRAG_CSS);
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
  });
  win.on('closed', () => {
    win = null;
  });
  if (file) void win.loadFile(file.path, { query: { shot: file.shot } });
  else if (url) void win.loadURL(url);
}

function installIpc(): void {
  const fromWindow = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => win !== null && e.sender === win.webContents;
  ipcMain.on(CH.notify, (e, n: NotifyArgs) => {
    if (fromWindow(e)) void notify(n, clickNotification);
  });
  ipcMain.on(CH.badge, (e, count: number) => {
    if (!fromWindow(e)) return;
    badgeText = count > 0 ? String(count) : '';
    app.dock?.setBadge(badgeText);
  });
  ipcMain.on(CH.tray, (e, rows: TrayRow[], lent: string | null) => {
    if (fromWindow(e)) updateTray(rows, lent, trayDeps);
  });
  ipcMain.handle(CH.mic, async (e) => {
    if (!fromWindow(e)) return false;
    if (TEST_MODE) return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
    return systemPreferences.askForMediaAccess('microphone');
  });
}

function installTestHook(): void {
  (globalThis as Record<string, unknown>).__shellTest = {
    notifications: () => [...recorded],
    trayLabels,
    badge: () => badgeText,
    clickNotification,
    trayAction: (a: TrayAction) => {
      showWindow();
      send(CH.trayAction, a);
    },
    clickTrayItem,
    windowVisible: () => Boolean(win && !win.isDestroyed() && win.isVisible()),
    closeWindow: () => win?.close(),
    dragRegion: () => win?.webContents.executeJavaScript(
      `(() => { const s = (e) => e ? getComputedStyle(e).webkitAppRegion : null; const q = (x) => document.querySelector(x);` +
      ` return { sidebarHeader: s(q('nav.astryx-side-nav > :first-child')), topBar: s(q('.astryx-layout-header')), button: s(q('button')) }; })()`,
    ),
    officeUrl,
    officePid,
  };
}

function setAppMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

async function boot(): Promise<void> {
  const shot = process.env.AGENT_MANAGER_SHOT; // fixture state from the renderer build, no office (scripts/smoke/electron-window.ts)
  if (shot) {
    createWindow(null, { path: join(import.meta.dirname, '../renderer/index.html'), shot });
    return;
  }
  try {
    await startOffice();
  } catch (err) {
    console.error(err);
    if (TEST_MODE) {
      app.exit(1);
      return;
    }
    const { response } = await dialog.showMessageBox({
      type: 'error',
      message: `${APP_NAME} could not start its office.`,
      detail: 'The log has the reason.',
      buttons: ['Show log', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.showItemInFolder(LOG_PATH);
    quitting = true;
    app.quit();
    return;
  }
  createWindow(process.env.ELECTRON_RENDERER_URL || `${officeUrl()}/`, null);
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {
    /* the app lives in the menu bar */
  });
  app.on('before-quit', (e) => {
    quitting = true;
    if (cleanedUp) return;
    e.preventDefault();
    void stopOffice().finally(() => {
      cleanedUp = true;
      app.quit();
    });
  });
  process.on('exit', killOfficeNow);

  void app.whenReady().then(async () => {
    setDockIcon();
    setAppMenu();
    installIpc();
    createTray(trayDeps);
    if (TEST_MODE) installTestHook();
    await boot();
  });
}
