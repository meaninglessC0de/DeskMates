import { resolve } from 'node:path';

export const APP_NAME = 'Deskmates';
export const TEST_MODE = process.env.AGENT_MANAGER_TEST === '1';
export const OFFICE_PORT = process.env.OFFICE_PORT || '4317';
export const REPO_ROOT = resolve(import.meta.dirname, '../..');
export const RESOURCES = resolve(REPO_ROOT, 'resources');
export const DATA_DIR = resolve(REPO_ROOT, process.env.DATA_DIR || 'data');

export const CH = {
  notify: 'shell:notify',
  badge: 'shell:set-badge',
  tray: 'shell:set-tray',
  mic: 'shell:ask-microphone',
  notificationClick: 'shell:notification-click',
  trayAction: 'shell:tray-action',
} as const;
