import type { ReactNode } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Overlay } from '@astryxdesign/core/Overlay';
import { MediaTheme } from '@astryxdesign/core/theme';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Monitor, X, ArrowLeftRight } from 'lucide-react';
import type { Employee } from '../../../shared';
import { AvatarVideo } from '../media/AvatarVideo';
import { SpaceView } from '../media/SpaceView';
import type { SpaceState } from '../media/SpaceView';
import type { Size } from './layout';

/** What the name chip of a face tile says. `lead` is the small thing before the words. */
export interface ChipState {
  text: string;
  lead?: 'spinner' | 'pulse';
  /** A quiet action after the text: "Ask again". */
  action?: { label: string; onClick: () => void };
}

function Chip({ chip }: { chip: ChipState }) {
  return (
    <MediaTheme mode="dark">
      <HStack gap={2} vAlign="center">
        {chip.lead === 'spinner' ? <Spinner size="sm" shade="onMedia" aria-label={chip.text} /> : null}
        {chip.lead === 'pulse' ? <StatusDot variant="accent" label="Speaking" isPulsing /> : null}
        <Text type="label" color="primary">
          {chip.text}
        </Text>
        {chip.action ? <Button label={chip.action.label} variant="secondary" size="sm" onClick={chip.action.onClick} /> : null}
      </HStack>
    </MediaTheme>
  );
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
  /** The portrait file exists; without it the tile shows initials. */
  hasPortrait: boolean;
  onPress: () => void;
  /** Hover action: bring this person's desktop up large (meetings). */
  onShowDesktop?: () => void;
  /** Spoken label for assistive technology. */
  label: string;
}

function avatarSize(size: Size): 48 | 72 | 96 | 128 {
  if (size.w < 200) return 48;
  if (size.w < 300) return 72;
  if (size.w < 360) return 96;
  return 128;
}

/** A person's tile: portrait or video, the speaking ring, a name chip, optional hover action. */
export function FaceTile({ employee, size, chip, hasRing, isDropped, videoTrack, audioTrack, hasPortrait, onPress, onShowDesktop, label }: FaceTileProps) {
  const p = employee.persona;
  const body: ReactNode =
    hasPortrait || videoTrack ? (
      <AvatarVideo track={videoTrack} audio={audioTrack} fallbackSrc={p.portraitUrl} name={p.name} />
    ) : (
      <Center width={size.w} height={size.h}>
        <Avatar name={p.name} size={avatarSize(size)} tooltip={false} />
      </Center>
    );

  const dimmed: ReactNode = isDropped ? (
    <Overlay position="fill" scrim="dark" content={null}>
      {body}
    </Overlay>
  ) : (
    body
  );

  const tile = (
    <SelectableCard label={label} isSelected={hasRing} onChange={onPress} padding={0} width={size.w} height={size.h} variant="default">
      <Overlay position="bottom" align="start" scrim={hasPortrait || videoTrack ? 'dark' : false} content={<Chip chip={chip} />}>
        {dimmed}
      </Overlay>
    </SelectableCard>
  );

  if (!onShowDesktop) return tile;
  return (
    <Overlay
      showOn="hover-or-focus"
      position="top"
      align="end"
      scrim={false}
      content={
        <MediaTheme mode="dark">
          <IconButton
            label="Show desktop"
            tooltip="Show desktop"
            icon={<Icon icon={Monitor} size="sm" color="inherit" />}
            variant="secondary"
            size="sm"
            onClick={onShowDesktop}
          />
        </MediaTheme>
      }>
      {tile}
    </Overlay>
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

/** An employee's live desktop, view only. */
export function DesktopTile({ employee, size, onClose, onSwap, onState, chipText }: DesktopTileProps) {
  const chip = (
    <MediaTheme mode="dark">
      <HStack gap={2} vAlign="center">
        <Text type="label" color="primary">
          {chipText}
        </Text>
        {onClose ? (
          <IconButton label="Back to grid" tooltip="Back to grid" icon={<Icon icon={X} size="sm" color="inherit" />} variant="ghost" size="sm" onClick={onClose} />
        ) : null}
      </HStack>
    </MediaTheme>
  );
  const view = (
    <VStack width={size.w}>
      <Overlay position="bottom" align="start" content={chip}>
        <SpaceView employeeId={employee.id} mode="view" onState={onState} />
      </Overlay>
    </VStack>
  );
  if (!onSwap) return view;
  return (
    <Overlay
      showOn="hover-or-focus"
      position="top"
      align="end"
      scrim={false}
      content={
        <MediaTheme mode="dark">
          <IconButton
            label="Swap"
            tooltip="Swap"
            icon={<Icon icon={ArrowLeftRight} size="sm" color="inherit" />}
            variant="secondary"
            size="sm"
            onClick={onSwap}
          />
        </MediaTheme>
      }>
      {view}
    </Overlay>
  );
}
