import { routes } from '../../../shared';
import type { ServerEvent } from '../../../shared';

export interface WsHandlers {
  onEvent(e: ServerEvent): void;
  onOpen(): void;
  onClose(): void;
}

/** Reconnecting WebSocket to office (`/ws`, relative). Returns a stop function. No-op in shot mode (callers skip it). */
export function connectWs(h: WsHandlers): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const url = (): string => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${routes.ws()}`;
  };

  const open = (): void => {
    if (stopped || location.protocol === 'file:') return; // a file:// build has no office to talk to
    ws = new WebSocket(url());
    ws.onopen = () => {
      attempt = 0;
      h.onOpen();
      ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25_000);
    };
    ws.onmessage = (m) => {
      try {
        h.onEvent(JSON.parse(String(m.data)) as ServerEvent);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      clearInterval(ping);
      h.onClose();
      if (stopped) return;
      const delay = Math.min(500 * 2 ** attempt++, 8000);
      retry = setTimeout(open, delay);
    };
    ws.onerror = () => ws?.close();
  };

  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(ping);
    ws?.close();
  };
}
