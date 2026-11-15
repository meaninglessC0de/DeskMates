import { useStore } from '../api/store';

/** Number of personal tints. They are defined once in `styles/app.ts` as `--am-tint-0..7` and `--am-tint-ink-0..7`. */
export const TINT_COUNT = 8;

/**
 * The cast (config/cast.json) has eight faces and there are eight tints, so each face owns one tint and four
 * colleagues never share a colour. Keyed by the portrait file name and by first name (whichever is known).
 */
const CAST_SLOT: Record<string, number> = {
  // 0-3 are the logo's four hues, in the demo's hiring order.
  maya: 0, // blue
  priya: 1, // orange
  jonas: 2, // pink
  ines: 3, // green
  marcus: 4, // violet
  kenji: 5, // teal
  amara: 6, // amber
  hannah: 7, // coral
};

function hash(s: string): number {
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function castSlot(name?: string, portraitUrl?: string): number | undefined {
  const file = portraitUrl?.split('/').pop()?.split('.')[0]?.replace(/-sq$/, '').toLowerCase();
  if (file && file in CAST_SLOT) return CAST_SLOT[file];
  const first = name?.trim().split(/\s+/)[0]?.toLowerCase();
  if (first && first in CAST_SLOT) return CAST_SLOT[first];
  return undefined;
}

/**
 * Stable tint slot 0..7 for a person. A cast face always gets its own slot; anyone else (the user, a described
 * role with an unknown name) gets a stable hash of the id. `name` is optional: when omitted the employee is
 * looked up in the store by id, so the stage and the app agree without passing names around.
 */
export function tintIndex(id: string, name?: string, portraitUrl?: string): number {
  let n = name;
  let url = portraitUrl;
  if (n === undefined && url === undefined) {
    const e = useStore.getState().employees.find((x) => x.id === id);
    n = e?.persona.name;
    url = e?.persona.portraitUrl;
  }
  return castSlot(n, url) ?? hash(id || n || '') % TINT_COUNT;
}

export interface TintVars {
  /** 0..7 */
  index: number;
  /** Soft background, as a CSS value: `var(--am-tint-N)`. */
  bg: string;
  /** Text on that background: `var(--am-tint-ink-N)`. */
  ink: string;
  /** Put on any Astryx component as `data-am-tint={attr}`: inside it `var(--am-tint)` and `var(--am-tint-ink)` resolve to this person's tint. */
  attr: string;
}

export function tintVars(id: string, name?: string, portraitUrl?: string): TintVars {
  const index = tintIndex(id, name, portraitUrl);
  return { index, bg: `var(--am-tint-${index})`, ink: `var(--am-tint-ink-${index})`, attr: String(index) };
}
