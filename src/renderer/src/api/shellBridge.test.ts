import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrayAction } from '../../../shared/shell';
import { EMP, employees } from '../fixtures/data';
import { initialData, sortEmployees } from './reducer';
import { badgeCount, lentTo, startShellBridge, trayRows } from './shellBridge';
import { useStore } from './store';

type Fake = {
  [K in 'notify' | 'setTray' | 'setBadge' | 'onNotificationClick' | 'onTrayAction' | 'askMicrophone']: ReturnType<typeof vi.fn>;
};

let fake: Fake;
let click: (id: string) => void;
let tray: (a: TrayAction) => void;

const get = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ ...initialData(), employees: sortEmployees(employees) });
  fake = {
    notify: vi.fn(),
    setTray: vi.fn(),
    setBadge: vi.fn(),
    onNotificationClick: vi.fn((cb: (id: string) => void) => {
      click = cb;
    }),
    onTrayAction: vi.fn((cb: (a: TrayAction) => void) => {
      tray = cb;
    }),
    askMicrophone: vi.fn(async () => true),
  };
  vi.stubGlobal('window', { shell: { ...fake, platform: 'darwin' } });
});

afterEach(() => vi.unstubAllGlobals());

describe('pure helpers', () => {
  it('builds tray rows in sidebar order with the sidebar labels', () => {
    expect(trayRows(sortEmployees(employees))).toEqual([
      { id: EMP.maya, name: 'Maya Chen', state: 'Needs you' },
      { id: EMP.priya, name: 'Priya Raman', state: 'Working' },
      { id: EMP.jonas, name: 'Jonas Weber', state: 'Idle' },
      { id: EMP.ines, name: 'Ines Moreau', state: 'Idle' },
    ]);
  });
  it('counts needs you and stuck for the badge, and names who holds the screen', () => {
    expect(badgeCount(employees)).toBe(1);
    expect(badgeCount(employees.map((e) => (e.id === EMP.jonas ? { ...e, state: 'stuck' as const } : e)))).toBe(2);
    expect(lentTo(employees)).toBeNull();
    expect(lentTo(employees.map((e) => (e.id === EMP.priya ? { ...e, screenGrant: { untilMs: null } } : e)))).toBe('Priya');
  });
});

describe('startShellBridge', () => {
  it('pushes the tray and badge at start and on every change, but not when nothing changed', () => {
    const stop = startShellBridge(useStore);
    expect(fake.setTray).toHaveBeenCalledTimes(1);
    expect(fake.setTray.mock.calls[0]![1]).toBeNull();
    expect(fake.setBadge).toHaveBeenLastCalledWith(1);

    get().applyServerEvent({ type: 'employee', employee: { ...employees[2]!, state: 'stuck', stateDetail: 'Site is down' } });
    expect(fake.setBadge).toHaveBeenLastCalledWith(2);
    expect(fake.setTray.mock.calls.at(-1)![0].map((r: { state: string }) => r.state)).toEqual(['Needs you', 'Stuck', 'Working', 'Idle']);

    get().applyServerEvent({ type: 'employee', employee: { ...employees[1]!, screenGrant: { untilMs: Date.now() + 60_000 } } });
    expect(fake.setTray.mock.calls.at(-1)![1]).toBe('Priya');

    const calls = fake.setTray.mock.calls.length;
    useStore.setState({ employees: [...get().employees] });
    expect(fake.setTray.mock.calls.length).toBe(calls);
    stop();
  });

  it('selects the employee when a notification is clicked', () => {
    startShellBridge(useStore);
    useStore.setState({ ui: { ...get().ui, view: 'team' } });
    click(EMP.jonas);
    expect(get().ui.selectedId).toBe(EMP.jonas);
    expect(get().ui.view).toBe('thread');
  });

  it('handles each tray action', () => {
    startShellBridge(useStore);
    const revokeScreen = vi.fn(async (_id: string) => null);
    const pauseEmployee = vi.fn(async (_id: string) => null);
    const resumeEmployee = vi.fn(async (_id: string) => null);
    useStore.setState({
      revokeScreen, pauseEmployee, resumeEmployee,
      employees: get().employees.map((e) => (e.id === EMP.priya ? { ...e, screenGrant: { untilMs: null } } : e.id === EMP.ines ? { ...e, state: 'paused' as const } : e)),
    });

    tray({ type: 'open', employeeId: EMP.ines });
    expect(get().ui.selectedId).toBe(EMP.ines);
    tray({ type: 'summon' });
    expect(get().ui.summonOpen).toBe(true);
    tray({ type: 'hire' });
    expect(get().ui.hireOpen).toBe(true);
    tray({ type: 'take_back' });
    expect(revokeScreen).toHaveBeenCalledWith(EMP.priya);
    tray({ type: 'pause_all' });
    expect(pauseEmployee.mock.calls.map((c) => c[0]).sort()).toEqual([EMP.maya, EMP.priya, EMP.jonas].sort());
    tray({ type: 'resume_all' });
    expect(resumeEmployee.mock.calls.map((c) => c[0])).toEqual([EMP.ines]);
  });

  it('does nothing in a plain browser', () => {
    vi.stubGlobal('window', {});
    expect(() => startShellBridge(useStore)()).not.toThrow();
    expect(fake.setTray).not.toHaveBeenCalled();
    get().applyServerEvent({ type: 'notify', employeeId: EMP.priya, title: 'Priya', body: 'Done', kind: 'done' });
    expect(fake.notify).not.toHaveBeenCalled();
  });
});

describe('notifications and calls', () => {
  it('notifies unless that thread is on screen and the window is focused', () => {
    useStore.setState({ ui: { ...get().ui, selectedId: EMP.maya, view: 'thread' } });
    get().applyServerEvent({ type: 'notify', employeeId: EMP.maya, title: 'Maya', body: 'Ready', kind: 'approval' });
    expect(fake.notify).not.toHaveBeenCalled();
    get().applyServerEvent({ type: 'notify', employeeId: EMP.priya, title: 'Priya', body: 'Done', kind: 'done' });
    expect(fake.notify).toHaveBeenCalledTimes(1);
    useStore.setState({ ui: { ...get().ui, view: 'team' } });
    get().applyServerEvent({ type: 'notify', employeeId: EMP.maya, title: 'Maya', body: 'Ready', kind: 'approval' });
    expect(fake.notify).toHaveBeenCalledTimes(2);
  });

  it('asks for the microphone before a call starts', async () => {
    const order: string[] = [];
    fake.askMicrophone.mockImplementation(async () => {
      order.push('mic');
      return false;
    });
    useStore.setState({ ui: { ...get().ui, selectedId: EMP.maya } });
    await get().startCall([EMP.maya]).catch(() => undefined);
    expect(order).toEqual(['mic']);
  });
});
