import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // the preload is an ES module; W9 decides when it has real content
      preload: join(import.meta.dirname, '../preload/index.mjs'),
    },
  });
  win.once('ready-to-show', () => win.show());

  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) {
    void win.loadURL(dev);
  } else if (process.env.AGENT_MANAGER_LOAD === 'office') {
    void win.loadURL(`http://127.0.0.1:${process.env.OFFICE_PORT ?? '4317'}/`);
  } else {
    // AGENT_MANAGER_SHOT=<area>/<name> opens that fixture state (used by scripts/smoke/electron-window.ts)
    const shot = process.env.AGENT_MANAGER_SHOT;
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), shot ? { query: { shot } } : undefined);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
