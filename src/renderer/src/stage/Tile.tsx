import type { ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Overlay } from '@astryxdesign/core/Overlay';
import { MediaTheme } from '@astryxdesign/core/theme';
import { Spinner } from '@astryxdesign/core/Spinner';
import { VStack } from '@astryxdesign/core/VStack';
import { Monitor, X, ArrowLeftRight } from 'lucide-react';
import type { Employee } from '../../../shared';
import { AvatarVideo } from '../media/AvatarVideo';
import { SpaceView } from '../media/SpaceView';
import type { SpaceState } from '../media/SpaceView';
import { Portrait } from '../ui/Portrait';
import { StageChip } from '../ui/StageChip';
import { StageTile } from '../ui/StageTile';
import { tintIndex } from '../ui/tint';
import type { Size } from './layout';

/** What the chip of a face tile says after the name. `lead` is the small thing before the name. */
export interface ChipState {
  /** One quiet word: the role in a meeting, or the state. Nothing when idle in a call. */
  detail?: string;
  lead?: 'spinner';
  /** A quiet action after the words: "Ask again". */
  action?: { label: string; onClick: () => void };
}

export interface FaceTileProps {
  employee: Employee;
  size: Size;
  chip: ChipState;
  /** The ring: this person has the floor. */
  hasRing: boolean;
  /** Dimmed and reconnecting. */
  isDropped?: boolean;
  /** Only the current speaker's tile gets the live video; every other tile shows a still. */
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  /** The portrait file exists; without it the tile shows the monogram on the person's tint. */
  hasPortrait: boolean;
  onPress: () => void;
  /** Hover action: bring this person's desktop up large (meetings). */
  onShowDesktop?: () => void;
  /** Spoken label for assistive technology. */
  label: string;
}

/**
 * The cast's stills come in 4:5 (`maya.jpg`) and square (`maya-sq.jpg`) with the same vertical framing; the live
 * video is square. The stage uses the square still so a still and the video crop identically.
 */
const CAST_FILES = ['maya', 'priya', 'jonas', 'ines', 'kenji', 'amara', 'marcus', 'hannah'];
export function squareStill(url: string): string {
  const m = /\/([a-z]+)\.jpg(\?.*)?$/.exec(url);
  return m && CAST_FILES.includes(m[1]!) ? url.replace(/\.jpg(\?.*)?$/, '-sq.jpg$1') : url;
}

/** Below this height a face tile without a photo reads as a row: the monogram, then the name beside it (spotlight strip of four). */
const ROW_TILE_HEIGHT = 150;
/**
 * How a face tile arranges itself: `tile` (video, photo or monogram filling it, chip bottom-left); `row` for a
 * short, wide strip tile (the portrait as a circle, then the name beside it: a photo cropped to a 2:1 band shows
 * only eyes); `stack` for the small 160 x 120 bottom-strip tile (portrait over the name, centred). A tile with live
 * video is always `tile`.
 */
function arrangement(hasVideo: boolean, size: Size): 'tile' | 'row' | 'stack' {
  if (hasVideo || size.h >= ROW_TILE_HEIGHT) return 'tile';
  return size.w >= 240 ? 'row' : 'stack';
}

/** The monogram scales with the tile: about 40 % of its shorter side, on Avatar's sizes. */
function portraitSize(size: Size): number {
  const side = Math.min(size.w, size.h);
  if (side < 150) return 48;
  if (side < 200) return 72;
  if (side < 260) return 96;
  if (side < 290) return 128;
  return 144;
}

function hoverAction(content: ReactNode, child: ReactNode) {
  return (
    <Overlay showOn="hover-or-focus" position="top" align="end" scrim={false} content={<VStack padding={2}><MediaTheme mode="dark">{content}</MediaTheme></VStack>}>
      {child}
    </Overlay>
  );
}

/** A person's tile: their video or photo filling it, or their monogram on their tint; the ring; the chip. */
export function FaceTile({ employee, size, chip, hasRing, isDropped, videoTrack, audioTrack, hasPortrait, onPress, onShowDesktop, label }: FaceTileProps) {
  const p = employee.persona;
  const hasMedia = hasPortrait || videoTrack !== null;
  const mode = arrangement(videoTrack !== null, size);
  const person = { id: employee.id, name: p.name, portraitUrl: hasPortrait ? p.portraitUrl : '' };
  // The still and the live video share one framing (square, head and shoulders), one crop and one anchor, so the
  // video fades in over the still without a jump. The video layer is only mounted while this tile has the track.
  const still = hasPortrait ? squareStill(p.portraitUrl) : '';
  const body: ReactNode = hasMedia ? (
    <VStack width={size.w} height={size.h}>
      <Overlay
        position="fill"
        scrim={false}
        content={
          videoTrack ? (
            <VStack data-am="video-layer" width={size.w} height={size.h}>
              <AvatarVideo track={videoTrack} audio={audioTrack} fallbackSrc={still} name={p.name} ratio={size.w / size.h} />
            </VStack>
          ) : null
        }>
        <AvatarVideo track={null} audio={null} fallbackSrc={still} name={p.name} ratio={size.w / size.h} />
      </Overlay>
    </VStack>
  ) : (
    <Center width={size.w} height={size.h}>
      <Portrait person={{ id: employee.id, name: p.name, portraitUrl: '' }} size={portraitSize(size)} />
    </Center>
  );
  const lead = chip.lead === 'spinner' ? <Spinner size="sm" aria-label={chip.detail ?? 'Working'} /> : undefined;
  const end = chip.action ? <Button label={chip.action.label} variant="secondary" size="sm" onClick={chip.action.onClick} /> : undefined;
  const chipNode = <StageChip name={p.firstName} detail={mode === 'stack' ? undefined : chip.detail} lead={lead} end={end} />;

  const tile = (
    <StageTile
      kind="face"
      width={size.w}
      height={size.h}
      tint={tintIndex(employee.id, p.name, p.portraitUrl)}
      hasRing={hasRing}
      hasMedia={hasMedia && mode === 'tile'}
      isDimmed={isDropped}
      onPress={onPress}
      label={label}
      chip={mode === 'tile' ? chipNode : undefined}>
      {mode === 'row' ? (
        <HStack width={size.w} height={size.h} gap={3} vAlign="center" paddingInline={4}>
          <Portrait person={person} size={48} />
          {chipNode}
        </HStack>
      ) : mode === 'stack' ? (
        <VStack width={size.w} height={size.h} gap={1} hAlign="center" vAlign="center" paddingInline={2}>
          <Portrait person={person} size={40} />
          {chipNode}
        </VStack>
      ) : (
        body
      )}
    </StageTile>
  );

  if (!onShowDesktop) return tile;
  return hoverAction(
    <IconButton label="Show desktop" tooltip="Show desktop" icon={<Icon icon={Monitor} size="sm" color="inherit" />} variant="secondary" size="sm" onClick={onShowDesktop} />,
    tile,
  );
}

export interface DesktopTileProps {
  employee: Employee;
  size: Size;
  /** Spotlight: the quiet x that goes back to the grid. */
  onClose?: () => void;
  /** Secondary tile: bring it to the front. */
  onSwap?: () => void;
  onState?: (s: SpaceState) => void;
  chipText: string;
}

/** Below this width a desktop tile is a thumbnail beside or inside the face: no label, the Swap action names it. */
const SMALL_TILE = 320;

/** An employee's live desktop, view only, in a hairline frame. */
export function DesktopTile({ employee, size, onClose, onSwap, onState, chipText }: DesktopTileProps) {
  const end = onClose ? (
    <IconButton label="Back to grid" tooltip="Back to grid (G)" icon={<Icon icon={X} size="sm" color="inherit" />} variant="ghost" size="sm" onClick={onClose} />
  ) : undefined;
  const view = (
    <StageTile kind="desktop" width={size.w} height={size.h} hasMedia chip={size.w >= SMALL_TILE ? <StageChip name={chipText} end={end} /> : undefined}>
      <Center width={size.w} height={size.h}>
        <VStack width={size.w}>
          <SpaceView employeeId={employee.id} mode="view" onState={onState} />
        </VStack>
      </Center>
    </StageTile>
  );
  if (!onSwap) return view;
  return hoverAction(
    <IconButton label="Swap" tooltip="Swap (S)" icon={<Icon icon={ArrowLeftRight} size="sm" color="inherit" />} variant="secondary" size="sm" onClick={onSwap} />,
    view,
  );
}
