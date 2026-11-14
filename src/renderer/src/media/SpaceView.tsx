import { useEffect, useRef, useState } from 'react';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Card } from '@astryxdesign/core/Card';
import { routes } from '../../../shared';
import type { StreamResponse } from '../../../shared';
import { api } from '../api/client';
import { isShot } from '../fixtures/shot';
import { MediaSession } from './cua-viewer/mediaSession';
import type { MediaTicket } from './cua-viewer/mediaSession';

export type SpaceState = 'connecting' | 'live' | 'offline' | 'error';

export interface SpaceViewProps {
  employeeId: string;
  mode: 'view' | 'control';
  onState?: (s: SpaceState) => void;
  /** Why the live stream gave way to polled frames, for diagnostics. */
  onFallback?: (reason: string) => void;
}

type Cua = Extract<StreamResponse, { kind: 'cua-media' }>;
type View = { kind: 'media' } | { kind: 'frames'; url: string; retry: boolean };

const FRAMES_RETRY_MS = 30_000;
const FIRST_FRAME_MS = 6_000;
const MAX_RESTARTS = 2;
const DEFAULT_RATIO = 16 / 10;
const RENEW_BEFORE_MS = 30_000;
const RENEW_MIN_MS = 5_000;
const SPARE_MARGIN_MS = 5_000;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

let h264Check: Promise<boolean> | null = null;

/** Whether this browser can decode the H.264 the Cua stream carries (WebCodecs). Cached. */
export function h264Supported(): Promise<boolean> {
  h264Check ??= (async () => {
    if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') return false;
    try {
      const r = await VideoDecoder.isConfigSupported({ codec: 'avc1.42E01F', optimizeForLatency: true });
      return r.supported === true;
    } catch {
      return false;
    }
  })();
  return h264Check;
}

/** Test only: `?mediaRenewMs=<n>` renews every n ms instead of shortly before the ticket expires. */
function renewOverrideMs(): number | null {
  if (typeof location === 'undefined') return null;
  const n = Number(new URLSearchParams(location.search).get('mediaRenewMs'));
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

/** When to fetch the next ticket: `RENEW_BEFORE_MS` ahead of the absolute expiry `expiresMs` (epoch ms), never sooner than `RENEW_MIN_MS`. */
export function renewDelayMs(expiresMs: number, nowMs: number = Date.now()): number {
  return renewOverrideMs() ?? Math.max(RENEW_MIN_MS, expiresMs - nowMs - RENEW_BEFORE_MS);
}

function toTicket(r: Cua): MediaTicket {
  return { wsUrl: r.wsUrl, ticketExpiresAt: new Date(r.expiresMs).toISOString(), mediaSessionId: r.mediaSessionId };
}

/**
 * The live view of an employee's desktop. Asks office for a stream: a `cua-media` ticket is played on a
 * canvas (H.264 over the Cua media socket); anything else, or any failure, shows `frame.jpg` polled
 * twice a second. A fresh ticket is requested after a drop once the old one has expired, when the
 * session is gone, and when the page becomes visible again (the stream is closed while hidden).
 * Mounting is keyed on employee and mode, so a mode change opens a new session.
 */
export function SpaceView(props: SpaceViewProps) {
  return <SpaceSession key={`${props.employeeId}:${props.mode}`} {...props} />;
}

function SpaceSession({ employeeId, mode, onState, onFallback }: SpaceViewProps) {
  const [view, setView] = useState<View>({ kind: 'media' });
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [attempt, setAttempt] = useState(0);
  const report = useRef(onState);
  report.current = onState;
  const fellBack = useRef(onFallback);
  fellBack.current = onFallback;
  const last = useRef<SpaceState | null>(null);
  const emit = (s: SpaceState): void => {
    if (last.current === s) return;
    last.current = s;
    report.current?.(s);
  };

  useEffect(() => {
    if (view.kind !== 'media' || !canvas) return;
    let stopped = false;
    let session: MediaSession | null = null;
    let starting = false;
    let restarts = 0;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let frameTimer: ReturnType<typeof setTimeout> | undefined;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let spare: Cua | null = null;

    // A live socket does not need its ticket, but a drop does. Keep a fresh one in hand, so that
    // a re-attach after the old ticket has expired does not wait for a round trip.
    const scheduleRenew = (expiresMs: number): void => {
      clearTimeout(renewTimer);
      renewTimer = setTimeout(async () => {
        if (stopped) return;
        let next = Date.now() + 15_000;
        try {
          const r = await api.stream(employeeId, { mode });
          if (r.kind === 'cua-media' && !stopped) {
            spare = r;
            next = r.expiresMs;
          }
        } catch {
          // try again on the next round
        }
        if (!stopped) scheduleRenew(next);
      }, renewDelayMs(expiresMs));
    };

    const end = (): void => {
      clearTimeout(frameTimer);
      clearTimeout(renewTimer);
      spare = null;
      session?.stop();
      session = null;
    };
    const toFrames = (reason: string, retry: boolean): void => {
      if (stopped) return;
      end();
      fellBack.current?.(reason);
      setView({ kind: 'frames', url: routes.frame(employeeId), retry });
    };

    const attach = (first: Cua): void => {
      let streamedSince = false;
      let attachFails = 0;
      let lost = false;
      const onLost = (reason: string): void => {
        if (lost || stopped) return;
        lost = true;
        end();
        restarts += 1;
        if (restarts > MAX_RESTARTS) {
          emit('error');
          toFrames(reason, true);
          return;
        }
        emit('connecting');
        restartTimer = setTimeout(() => void begin(), 1000);
      };
      const s = new MediaSession({
        canvas,
        ticket: toTicket(first),
        interactive: mode === 'control',
        audio: false,
        metaAsControl: IS_MAC,
        wholeCommandChords: IS_MAC,
        scrollNeedsFocus: true,
        reopen: async () => {
          const held = spare;
          spare = null;
          if (held && held.expiresMs - Date.now() > SPARE_MARGIN_MS) return toTicket(held);
          const r = await api.stream(employeeId, { mode });
          if (r.kind !== 'cua-media') throw new Error('stream unavailable');
          return toTicket(r);
        },
        onStatus: (status, detail) => {
          if (stopped || lost) return;
          if (status === 'connecting') emit('connecting');
          else if (status === 'streaming') {
            streamedSince = true;
            attachFails = 0;
            clearTimeout(frameTimer);
            frameTimer = setTimeout(() => toFrames('no video decoded', false), FIRST_FRAME_MS);
          } else if (status === 'reconnecting') {
            emit('connecting');
            if (streamedSince) streamedSince = false;
            else if (++attachFails >= 2) toFrames('attach failed twice', true);
          } else if (status === 'ended') onLost(detail ?? 'ended');
          else if (status === 'failed') {
            emit('error');
            toFrames(detail ?? 'failed', true);
          }
        },
        onGeometry: (w, h) => {
          if (w > 0 && h > 0) setRatio(w / h);
        },
        onFrame: () => {
          clearTimeout(frameTimer);
          if (last.current !== 'live') {
            emit('live');
            if (mode === 'control') canvas.focus();
          }
        },
        onGone: (reason) => onLost(reason),
      });
      session = s;
      s.start();
      scheduleRenew(first.expiresMs);
    };

    const begin = async (): Promise<void> => {
      if (stopped || session || starting || document.hidden) return;
      starting = true;
      emit('connecting');
      let resp: StreamResponse;
      try {
        if (!(await h264Supported())) {
          starting = false;
          toFrames('h264 not supported here', false);
          return;
        }
        resp = await api.stream(employeeId, { mode });
      } catch (e) {
        starting = false;
        const status = (e as { status?: number } | null)?.status;
        emit(status === 404 || status === 409 ? 'offline' : 'error');
        toFrames('stream request failed', true);
        return;
      }
      starting = false;
      if (stopped) return;
      if (resp.kind === 'frames') {
        setView({ kind: 'frames', url: resp.url, retry: false });
        return;
      }
      attach(resp);
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        clearTimeout(restartTimer);
        end();
      } else void begin();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void begin();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(restartTimer);
      end();
    };
  }, [employeeId, mode, view.kind, canvas, attempt]);

  useEffect(() => {
    if (view.kind !== 'frames' || !view.retry) return;
    const t = setTimeout(() => {
      setView({ kind: 'media' });
      setAttempt((a) => a + 1);
    }, FRAMES_RETRY_MS);
    return () => clearTimeout(t);
  }, [view]);

  return (
    <Card variant="muted" padding={0}>
      {view.kind === 'media' ? (
        <AspectRatio ratio={ratio} fit="contain">
          <canvas ref={setCanvas} aria-label={mode === 'control' ? 'Desktop, in control' : 'Desktop'} />
        </AspectRatio>
      ) : (
        <Frames url={view.url} label={mode === 'control' ? 'Desktop, in control' : 'Desktop'} emit={emit} />
      )}
    </Card>
  );
}

function Frames({ url, label, emit }: { url: string; label: string; emit: (s: SpaceState) => void }) {
  const [tick, setTick] = useState(0);
  const failures = useRef(0);
  const stalled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    emit('connecting');
    const onVisible = (): void => {
      if (!document.hidden && stalled.current) {
        stalled.current = false;
        setTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const next = (ms: number): void => {
    if (isShot()) return;
    clearTimeout(timer.current);
    if (document.hidden) {
      stalled.current = true;
      return;
    }
    timer.current = setTimeout(() => setTick((t) => t + 1), ms);
  };

  return (
    <AspectRatio ratio={DEFAULT_RATIO} fit="contain">
      <img
        src={`${url}${url.includes('?') ? '&' : '?'}t=${tick}`}
        alt={label}
        onLoad={() => {
          failures.current = 0;
          emit('live');
          next(500);
        }}
        onError={() => {
          failures.current += 1;
          emit(failures.current >= 3 ? 'offline' : 'error');
          next(failures.current >= 3 ? 5000 : 1500);
        }}
      />
    </AspectRatio>
  );
}
