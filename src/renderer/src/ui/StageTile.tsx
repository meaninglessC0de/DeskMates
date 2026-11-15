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
  /** Dimmed (reconnecting, calling). */
  isDimmed?: boolean;
  /** Over the dimmed tile, centred in its lower part in place of the chip: the brand loader and "Calling Maya". */
  centre?: ReactNode;
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
export function StageTile({ kind, width, height, tint, hasRing = false, hasMedia = false, isDimmed = false, centre, chip, onPress, label, children }: StageTileProps) {
  const attrs = {
    'data-am': 'tile',
    'data-am-kind': kind,
    'data-am-tint': tint === undefined ? undefined : String(tint),
    'data-am-ring': hasRing ? 'on' : 'off',
    'data-am-media': hasMedia ? 'on' : 'off',
    // How a square or 4:5 photo is anchored (ui/styles/stage.ts): only wide tiles crop top and bottom.
    'data-am-crop': width / height < 1.05 ? 'tall' : width / height < 1.5 ? 'standard' : 'wide',
  };
  // The dim layer is always there and fades (ui/styles/stage.ts), so "Calling Maya" cross-fades into the live tile.
  const dim = isDimmed || !!centre;
  const body = (
    <Overlay position="fill" scrim={false} content={<VStack data-am="tile-dim" data-am-on={dim ? 'on' : 'off'} width="100%" height="100%">{null}</VStack>}>
      {children}
    </Overlay>
  );
  const inner = (
    <Overlay
      position="bottom"
      align="start"
      scrim={false}
      content={
        centre ? (
          <VStack data-am="tile-centre" padding={4} hAlign="center" width="100%">
            {centre}
          </VStack>
        ) : chip ? (
          <VStack data-am="tile-chip" padding={1} hAlign="start" width="100%">
            {chip}
          </VStack>
        ) : null
      }>
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
