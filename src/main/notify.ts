import { Notification, nativeImage, type NativeImage } from 'electron';
import { TEST_MODE } from './constants';
import { officeUrl } from './office';

export interface NotifyArgs {
  employeeId: string;
  title: string;
  body: string;
  portraitUrl: string;
}

export interface RecordedNotification extends NotifyArgs {
  iconLoaded: boolean;
}

export const recorded: RecordedNotification[] = [];
const live = new Map<string, Notification>();

async function loadPortrait(url: string): Promise<NativeImage | undefined> {
  if (!url) return undefined;
  try {
    const abs = new URL(url, officeUrl()).toString();
    const res = await fetch(abs, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return undefined;
    const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()));
    return img.isEmpty() ? undefined : img;
  } catch {
    return undefined;
  }
}

export async function notify(n: NotifyArgs, onClick: (employeeId: string) => void): Promise<void> {
  const icon = await loadPortrait(n.portraitUrl);
  if (TEST_MODE) {
    recorded.push({ ...n, iconLoaded: Boolean(icon) });
    return;
  }
  live.get(n.employeeId)?.close();
  const note = new Notification({ title: n.title, body: n.body, icon, silent: false });
  note.on('click', () => onClick(n.employeeId));
  note.on('close', () => {
    if (live.get(n.employeeId) === note) live.delete(n.employeeId);
  });
  live.set(n.employeeId, note);
  note.show();
}
