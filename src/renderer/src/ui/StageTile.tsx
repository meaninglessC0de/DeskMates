import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Overlay } from '@astryxdesign/core/Overlay';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { VStack } from '@astryxdesign/core/VStack';

export interface StageTileProps {
  /** `face`: a person (tint wash, hairline in their tint, speaking ring). `desktop`: a screen (neutral hairline frame). */
  kind: 'face' | 'desktop';
  width: number;
  height: number;
  /** The person's tint slot (ui/tint.ts), for the wash behind the monogram and the hairline. */
  tint?: number;
  /** The speaking ring: this person has the floor. Fades in and out. */
  hasRing?: boolean;
  /** A photo, video or desktop fills the tile: the chip gets a scrim under it. */
  hasMedia?: boolean;
  /** Dimmed (reconnecting). */
  isDimmed?: boolean;
  /** Bottom-left, inset one step: a `StageChip`. */
  chip?: ReactNode;
  /** With `onPress` the tile is a button (SelectableCard) and `label` is its spoken name. */
  onPress?: () => void;
  label?: string;
  children: ReactNode;
}

/**
 * A tile on the dark stage. Astryx has a Card and a SelectableCard but no media tile with a hairline and a ring
 * that sit above the video, a functional scrim under its label, or a per-person tint. The frame, the wash, the
 * hairline and the ring are drawn by `ui/styles/stage.ts` from the `data-am-*` attributes set here.
 */
export function StageTile({ kind, width, height, tint, hasRing = false, hasMedia = false, isDimmed = false, chip, onPress, label, children }: StageTileProps) {
  const attrs = {
    'data-am': 'tile',
    'data-am-kind': kind,
    'data-am-tint': tint === undefined ? undefined : String(tint),
    'data-am-ring': hasRing ? 'on' : 'off',
    'data-am-media': hasMedia ? 'on' : 'off',
  };
  const body = isDimmed ? (
    <Overlay position="fill" scrim="dark" content={null}>
      {children}
    </Overlay>
  ) : (
    children
  );
  const inner = (
    <Overlay
      position="bottom"
      align="start"
      scrim={false}
      content={chip ? <VStack data-am="tile-chip" padding={3} hAlign="start" width="100%">{chip}</VStack> : null}>
      {body}
    </Overlay>
  );
  if (onPress) {
    return (
      <SelectableCard {...attrs} label={label ?? ''} isSelected={hasRing} onChange={onPress} padding={0} width={width} height={height} variant="transparent">
        {inner}
      </SelectableCard>
    );
  }
  return (
    <Card {...attrs} padding={0} width={width} height={height} variant="transparent">
      {inner}
    </Card>
  );
}
