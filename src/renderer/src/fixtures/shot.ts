/**
 * `?shot=<area>/<name>` puts the app in screenshot mode: the store is loaded from the fixtures,
 * no API call and no WebSocket is made, and that area's named state is rendered.
 * Extra query parameters (from a shot's `query`) tune the state; see fixtures/load.ts.
 */
export interface ShotRef {
  area: string;
  name: string;
  params: URLSearchParams;
}

let cached: ShotRef | null | undefined;

export function getShot(): ShotRef | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    const raw = params.get('shot');
    if (raw) {
      const [area = '', name = ''] = raw.split('/');
      cached = { area, name, params };
    }
  }
  return cached;
}

export function isShot(): boolean {
  return getShot() !== null;
}

/** Components may read this to render a named variant (for example `useShot()?.name === 'empty'`). */
export function useShot(): ShotRef | null {
  return getShot();
}
