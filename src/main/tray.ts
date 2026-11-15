import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import type { TrayAction } from '../shared/shell';
import { APP_NAME, RESOURCES } from './constants';

export interface TrayRow {
  id: string;
  name: string;
  state: string;
}

export interface TrayDeps {
  showWindow(): void;
  sendAction(a: TrayAction): void;
}

let tray: Tray | null = null;
let current: { menu: Menu; labels: string[] } = { menu: new Menu(), labels: [] };

function stateLabel(state: string): string {
  const s = state.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildTrayMenu(rows: TrayRow[], lent: string | null, deps: TrayDeps): { menu: Menu; labels: string[] } {
  const act = (a: TrayAction) => () => {
    deps.showWindow();
    deps.sendAction(a);
  };
  const template: MenuItemConstructorOptions[] = [];

  if (lent) {
    const who = rows.find((r) => r.id === lent)?.name ?? lent;
    template.push({ label: `${who} is using your screen`, enabled: false });
    template.push({ label: 'Take it back', click: act({ type: 'take_back' }) });
    template.push({ type: 'separator' });
  }
  for (const r of rows) {
    template.push({ label: `${r.name}    ${stateLabel(r.state)}`, click: act({ type: 'open', employeeId: r.id }) });
  }
  if (rows.length) template.push({ type: 'separator' });
  template.push({ label: 'Show desks', accelerator: 'Shift+CommandOrControl+D', click: act({ type: 'desks' }) });
  template.push({ label: 'Summon meeting…', accelerator: 'Shift+CommandOrControl+M', click: act({ type: 'summon' }) });
  template.push({ label: 'Hire…', accelerator: 'CommandOrControl+N', click: act({ type: 'hire' }) });
  template.push({ type: 'separator' });
  const allPaused = rows.length > 0 && rows.every((r) => r.state === 'paused');
  template.push(
    allPaused
      ? { label: 'Resume everyone', click: act({ type: 'resume_all' }) }
      : { label: 'Pause everyone', click: act({ type: 'pause_all' }) },
  );
  template.push({ label: `Open ${APP_NAME}`, click: () => deps.showWindow() });
  template.push({ label: 'Quit', accelerator: 'CommandOrControl+Q', click: () => app.quit() });

  return {
    menu: Menu.buildFromTemplate(template),
    labels: template.map((t) => (t.type === 'separator' ? '---' : (t.label ?? ''))),
  };
}

export function createTray(deps: TrayDeps): void {
  const icon = nativeImage.createFromPath(join(RESOURCES, 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  updateTray([], null, deps);
}

export function updateTray(rows: TrayRow[], lent: string | null, deps: TrayDeps): void {
  current = buildTrayMenu(rows, lent, deps);
  tray?.setContextMenu(current.menu);
}

export function trayLabels(): string[] {
  return current.labels;
}

/** Test hook: runs the click handler of the menu item with this label (prefix match). */
export function clickTrayItem(label: string): boolean {
  const item = current.menu.items.find((i) => i.label === label || i.label.startsWith(label));
  if (!item || !item.enabled) return false;
  item.click();
  return true;
}
