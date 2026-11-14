import { contextBridge, ipcRenderer } from 'electron';
import type { ShellBridge } from '../shared/shell';

const CH = {
  notify: 'shell:notify',
  badge: 'shell:set-badge',
  tray: 'shell:set-tray',
  mic: 'shell:ask-microphone',
  notificationClick: 'shell:notification-click',
  trayAction: 'shell:tray-action',
} as const;

const shell: ShellBridge = {
  notify: (n) => ipcRenderer.send(CH.notify, n),
  onNotificationClick: (cb) => {
    ipcRenderer.on(CH.notificationClick, (_e, employeeId: string) => cb(employeeId));
  },
  setBadge: (count) => ipcRenderer.send(CH.badge, count),
  setTray: (rows, lent) => ipcRenderer.send(CH.tray, rows, lent),
  onTrayAction: (cb) => {
    ipcRenderer.on(CH.trayAction, (_e, action) => cb(action));
  },
  askMicrophone: () => ipcRenderer.invoke(CH.mic) as Promise<boolean>,
  platform: 'darwin',
};

contextBridge.exposeInMainWorld('shell', shell);
