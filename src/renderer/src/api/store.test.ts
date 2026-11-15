import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMP, employees, threads } from '../fixtures/data';
import { initialData, sortEmployees } from './reducer';
import { useStore } from './store';

const get = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ ...initialData(), employees: sortEmployees(employees) });
});

describe('store against the fixture transport', () => {
  it('boot loads employees, presets, settings and capabilities, selects the first and loads its thread', async () => {
    // fake api is only used when ?shot= is present, so stub fetch for this test
    vi.stubGlobal('location', { search: '?shot=shell/sidebar' });
    vi.resetModules();
    const fresh = (await import('./store')).useStore;
    await fresh.getState().boot();
    const s = fresh.getState();
    expect(s.bootState).toBe('ready');
    expect(s.employees).toHaveLength(4);
    expect(s.presets).toHaveLength(8);
    expect(s.settings?.userName).toBe('Suhaan');
    expect(s.ui.selectedId).toBe(EMP.maya);
    expect(s.threads[EMP.maya]?.loaded).toBe(true);
    expect(s.threads[EMP.maya]?.messages.length).toBe(threads[EMP.maya]!.messages.length);
    vi.unstubAllGlobals();
  });
});

describe('actions without the network', () => {
  it('toggleDesktop and setView change ui only', () => {
    get().toggleDesktop(EMP.maya);
    expect(get().ui.desktopOpen[EMP.maya]).toBe(true);
    get().toggleDesktop(EMP.maya, false);
    expect(get().ui.desktopOpen[EMP.maya]).toBe(false);
    get().setView('team');
    expect(get().ui.view).toBe('team');
  });
  it('the Desks view remembers where it came from and keeps the faces flag', () => {
    get().setDeskFaces(false);
    get().setView('team');
    get().openDesks();
    expect(get().ui.view).toBe('desks');
    get().openDesks();
    get().closeDesks();
    expect(get().ui.view).toBe('team');
    get().closeDesks();
    expect(get().ui.view).toBe('team');
    expect(get().ui.desksFaces).toBe(false);
  });
  it('applyServerEvent applies the reducer patch', () => {
    get().applyServerEvent({ type: 'employee', employee: { ...employees[2]!, state: 'stuck', stateDetail: 'Out of ideas' } });
    expect(get().employees.map((e) => e.persona.firstName).slice(0, 2)).toEqual(['Maya', 'Jonas']);
  });
  it('applyServerEvent runs the shell effect for notify', () => {
    const notify = vi.fn();
    vi.stubGlobal('window', { shell: { notify } });
    get().applyServerEvent({ type: 'notify', employeeId: EMP.priya, title: 'Priya', body: 'Done', kind: 'done' });
    expect(notify).toHaveBeenCalledWith({ employeeId: EMP.priya, title: 'Priya', body: 'Done', portraitUrl: employees[1]!.persona.portraitUrl });
    vi.unstubAllGlobals();
  });
  it('showToast sets a new toast each time', () => {
    get().showToast('a');
    get().showToast('b', 'info');
    expect(get().toast).toEqual({ seq: 2, text: 'b', tone: 'info' });
  });
});
