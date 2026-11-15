import { Avatar } from '@astryxdesign/core/Avatar';
import type { EmployeeState } from '../../../shared';
import { getShot } from '../fixtures/shot';
import { PresenceDot } from '../shell/PresenceDot';
import { tintIndex } from './tint';

type AvatarSize = 16 | 20 | 24 | 32 | 36 | 40 | 48 | 60 | 64 | 72 | 96 | 128 | 144 | 180;
const SIZES: AvatarSize[] = [16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180];

function nearest(n: number): AvatarSize {
  let best: AvatarSize = 40;
  for (const s of SIZES) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

/** Cast portraits are 4:5 with a 1:1 crop beside them (`maya.jpg`, `maya-sq.jpg`); circles use the square crop. */
function squareCrop(url: string): string | undefined {
  return /\/media\/portraits\/[^/]+\.jpg$/.test(url) && !url.endsWith('-sq.jpg') ? url.replace(/\.jpg$/, '-sq.jpg') : undefined;
}

export interface PortraitPerson {
  id: string;
  name: string;
  portraitUrl?: string | null;
}

export interface PortraitProps {
  person: PortraitPerson;
  /** Diameter in px. Snaps to the nearest size Astryx's Avatar supports. */
  size?: 24 | 32 | 40 | 56 | 96 | 144 | number;
  /** Shows the presence dot, cut out of the circle. */
  presence?: EmployeeState;
  /** Built-in name tooltip. Off by default: the name is almost always written next to the face. */
  tooltip?: boolean;
}

/**
 * A person's face: the photo (its square crop for the circle), otherwise their monogram on their own soft tint
 * (also the state while the photo loads or if it fails).
 * Fills the Astryx gap "Avatar fallback colour per person": Avatar's initials are always grey.
 */
export function Portrait({ person, size = 40, presence, tooltip = false }: PortraitProps) {
  const noPhotos = getShot()?.params.get('portraits') === 'none';
  const url = noPhotos ? '' : person.portraitUrl || '';
  const square = url ? squareCrop(url) : undefined;
  const src = square ?? (url || undefined);
  const px = nearest(size);
  return (
    <Avatar
      data-am-portrait=""
      data-am-tint={String(tintIndex(person.id, person.name, person.portraitUrl ?? ''))}
      data-am-portrait-size={String(px)}
      name={person.name}
      src={src}
      fallbackSrc={square ? url : undefined}
      size={px}
      tooltip={tooltip}
      status={presence ? <PresenceDot state={presence} /> : undefined}
    />
  );
}
