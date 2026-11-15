import { useStore } from '../api/store';
import { PIN_EVENT } from '../stage/pin';
import { getConnectedRoom } from '../stage/useLiveKit';

/**
 * `window.__deskmatesDemo`: drive the app from outside (Playwright over CDP while a screen recording runs).
 * Always installed; every method is a plain call into the store or the stage and has no UI of its own.
 */
export interface DeskmatesDemo {
  /** Open the Desks view. */
  openDesks(): void;
  /** Leave the Desks view for the view it was opened from. */
  closeDesks(): void;
  /** Show or hide every face on the Desks view. Can be set before the view opens. */
  setFaces(on: boolean): void;
  /** Show or hide the messages rail on the Desks view (the M key). Shown by default. Can be set before the view opens. */
  setMessages(on: boolean): void;
  /** Open this person's conversation. */
  openThread(employeeId: string): void;
  /** Open the team view. */
  openTeam(): void;
  /** During a call or meeting: show this person's desktop large; `null` goes back to the grid (or the face). */
  pin(employeeId: string | null): void;
  /** During a call or meeting: send typed text into the room; resolves false when there is no connected room. */
  say(text: string): Promise<boolean>;
  /** Start a one-to-one call; resolves false when it could not start. */
  startCall(employeeId: string): Promise<boolean>;
  /** Start a meeting with these people; resolves false when it could not start. */
  summon(employeeIds: string[]): Promise<boolean>;
  /** End the current call or meeting. */
  endCall(): Promise<void>;
  /** Approve a pending approval by id; resolves false when it was not accepted. */
  approve(approvalId: string): Promise<boolean>;
}

export const demo: DeskmatesDemo = {
  openDesks: () => useStore.getState().openDesks(),
  closeDesks: () => useStore.getState().closeDesks(),
  setFaces: (on) => useStore.getState().setDeskFaces(Boolean(on)),
  setMessages: (on) => useStore.getState().setDeskMessages(Boolean(on)),
  openThread: (employeeId) => void useStore.getState().selectEmployee(employeeId),
  openTeam: () => useStore.getState().setView('team'),
  pin: (employeeId) => {
    window.dispatchEvent(new CustomEvent(PIN_EVENT, { detail: { employeeId } }));
  },
  async say(text) {
    const room = getConnectedRoom();
    if (!room) return false;
    try {
      await room.localParticipant.sendText(text, { topic: 'lk.chat' });
      return true;
    } catch {
      return false;
    }
  },
  startCall: (employeeId) => useStore.getState().startCall([employeeId]),
  summon: (employeeIds) => useStore.getState().startCall([...employeeIds]),
  endCall: () => useStore.getState().endCall(),
  approve: (approvalId) => useStore.getState().decideApproval(approvalId, { decision: 'approve' }),
};

export function installDemoHook(): void {
  if (typeof window !== 'undefined') window.__deskmatesDemo = demo;
}
