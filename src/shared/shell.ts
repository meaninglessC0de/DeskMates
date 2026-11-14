export interface ShellBridge {
  notify(n: { employeeId: string; title: string; body: string; portraitUrl: string }): void;
  onNotificationClick(cb: (employeeId: string) => void): void;
  setBadge(count: number): void;                       // Dock badge = employees in needs_you or stuck
  setTray(rows: { id: string; name: string; state: string }[], lent: string | null): void;
  onTrayAction(cb: (a: { type: 'open'; employeeId: string } | { type: 'summon' } | { type: 'hire' } | { type: 'take_back' } | { type: 'pause_all' } | { type: 'resume_all' }) => void): void;
  askMicrophone(): Promise<boolean>;
  platform: 'darwin';
}

export type TrayAction = Parameters<Parameters<ShellBridge['onTrayAction']>[0]>[0];

declare global {
  interface Window {
    shell?: ShellBridge;
  }
}
