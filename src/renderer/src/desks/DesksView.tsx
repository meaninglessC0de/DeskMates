import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Overlay } from '@astryxdesign/core/Overlay';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import { Plus } from 'lucide-react';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';
import { SpaceView } from '../media/SpaceView';
import type { SpaceState } from '../media/SpaceView';
import { useWindowSize } from '../stage/useWindowSize';
import { themes, defaultThemeSlug } from '../theme';
import { DeskLoader } from '../ui/DeskLoader';
import { Portrait } from '../ui/Portrait';
import { StageTile } from '../ui/StageTile';
import { tintIndex } from '../ui/tint';
import { deskArea, desksLayout, seat } from './layout';
import { MessagesRail } from './Rail';
import { feedRows, liveBubbles, livePulses, nextExpiry, peerMessages } from './feed';
import type { DeskMessage } from './feed';
import { deskStatus } from './status';
import type { Size } from '../stage/layout';

/** What a desk tile shows in place of the stream: the desktop panel's own cases (desktop/parts.tsx, `Screen`). */
function offScreen(e: Employee): 'lent' | 'starting' | 'off' | null {
  if (e.screenGrant) return 'lent';
  if (e.state === 'starting') return 'starting';
  if (e.state === 'offline' || e.desktopSinceMs === null) return 'off';
  return null;
}

function Screen({ employee, size }: { employee: Employee; size: Size }) {
  const [state, setState] = useState<SpaceState>('connecting');
  const first = employee.persona.firstName;
  const off = offScreen(employee);
  const loader = <DeskLoader size={Math.round(size.w * 0.06)} />;
  if (off === 'starting') {
    return (
      <Center width={size.w} height={size.h}>
        {loader}
      </Center>
    );
  }
  if (off === 'lent' || off === 'off') {
    return (
      <Center width={size.w} height={size.h}>
        <EmptyState isCompact title={off === 'lent' ? `${first} is on your screen` : 'Desktop is off'} />
      </Center>
    );
  }
  // The stream has not started: the brand loader over the tile (laid over by CSS, so a click still reaches the tile's
  // own button), gone as soon as frames arrive.
  return (
    <>
      <Center width={size.w} height={size.h}>
        <VStack width={size.w}>
          <SpaceView employeeId={employee.id} mode="view" onState={setState} />
        </VStack>
      </Center>
      {state === 'connecting' ? (
        <Center data-am="desk-wait" width={size.w} height={size.h}>
          {loader}
        </Center>
      ) : null}
    </>
  );
}

/** The face window, top-right: the still portrait on the person's tint, the first name under it, a ring in their tint. */
function Face({ employee, desk }: { employee: Employee; desk: number }) {
  const p = employee.persona;
  return (
    <VStack data-am="desk-face" data-am-face={String(desk)} data-am-desk-index={String(desk)} data-am-tint={String(tintIndex(employee.id, p.name, p.portraitUrl))} padding={3} hAlign="end">
      <VStack data-am="desk-face-window" hAlign="center" gap={1} padding={1}>
        <Portrait person={{ id: employee.id, name: p.name, portraitUrl: p.portraitUrl }} size={72} shape="rounded" />
        <Text type="label" color="primary" maxLines={1}>
          {p.firstName}
        </Text>
      </VStack>
    </VStack>
  );
}

/** The pill, bottom-left: "Desk 1 · Maya" over one status line (state, then what they are doing), plan count at the end of the first line. */
function DeskChip({ employee, desk }: { employee: Employee; desk: number }) {
  const slice = useStore((s) => s.threads[employee.id]);
  const st = deskStatus(employee, slice);
  return (
    <VStack data-am="desk-chip" data-am-tone={st.tone} gap={0.5}>
      <HStack data-am="desk-chip-head" gap={2} vAlign="center">
        <Text type="label" color="primary" maxLines={1}>
          {`Desk ${desk + 1} · ${employee.persona.firstName}`}
        </Text>
        {st.progress ? (
          <Text type="supporting" data-am="desk-progress">
            {st.progress}
          </Text>
        ) : null}
      </HStack>
      <HStack data-am="desk-status" gap={1} vAlign="center">
        {st.word ? (
          <Text type="supporting" data-am="desk-state" data-am-tone={st.tone}>
            {st.detail ? `${st.word} ·` : st.word}
          </Text>
        ) : null}
        {st.detail ? (
          <Text type="supporting" data-am="desk-detail" maxLines={1}>
            {st.detail}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}

/** A message the person just sent, top-left in their tint: "To Jonas", then the text in up to three lines. A new one replaces the old (keyed by step). */
function Bubble({ message, to, desk }: { message: DeskMessage; to: string; desk: number }) {
  const from = useStore((s) => s.employees.find((e) => e.id === message.from));
  const tint = from ? tintIndex(from.id, from.persona.name, from.persona.portraitUrl) : desk;
  return (
    <VStack data-am="desk-bubble-slot" data-am-desk-index={String(desk)} padding={3}>
      <VStack key={message.id} data-am="desk-bubble" data-am-tint={String(tint)} gap={0.5} padding={2}>
        <Text type="supporting" color="secondary" maxLines={1} data-am="desk-bubble-to">
          {`To ${to}`}
        </Text>
        <Text type="label" color="primary" maxLines={3} data-am="desk-bubble-text">
          {message.text}
        </Text>
      </VStack>
    </VStack>
  );
}

/** A short ring in the sender's tint around the tile that just received a message. */
function Pulse({ message }: { message: DeskMessage }) {
  const from = useStore((s) => s.employees.find((e) => e.id === message.from));
  const tint = from ? tintIndex(from.id, from.persona.name, from.persona.portraitUrl) : 0;
  return <VStack key={message.id} data-am="desk-pulse" data-am-tint={String(tint)}>{null}</VStack>;
}

/** Re-render when the next bubble or pulse ends. The view reads `Date.now()` on each render. */
function useExpiry(messages: DeskMessage[]): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const next = nextExpiry(messages, Date.now());
  useEffect(() => {
    if (next === null) return;
    const t = setTimeout(bump, Math.max(0, next - Date.now()) + 30);
    return () => clearTimeout(t);
  }, [next]);
}

/** Opens the person's conversation with the desktop panel open (no-op once the Desks view has been left). */
function openThread(employee: Employee): void {
  const s = useStore.getState();
  if (s.ui.view !== 'desks') return;
  s.toggleDesktop(employee.id, true);
  void s.selectEmployee(employee.id);
}

function openHire(): void {
  useStore.getState().setUi({ hireOpen: true });
}

function DeskTile({ employee, desk, size, faces, bubble, pulse, nameOf }: { employee: Employee; desk: number; size: Size; faces: boolean; bubble?: DeskMessage; pulse?: DeskMessage; nameOf: (id: string) => string }) {
  const first = employee.persona.firstName;
  return (
    <StageTile
      kind="desktop"
      width={size.w}
      height={size.h}
      hasMedia
      onPress={() => openThread(employee)}
      label={`Desk ${desk + 1}, ${first}`}
      chip={<DeskChip employee={employee} desk={desk} />}>
      <Screen employee={employee} size={size} />
      {faces ? <Face employee={employee} desk={desk} /> : null}
      {bubble ? <Bubble message={bubble} to={nameOf(bubble.to)} desk={desk} /> : null}
      {pulse ? <Pulse message={pulse} /> : null}
    </StageTile>
  );
}

function HireTile({ desk, size }: { desk: number; size: Size }) {
  return (
    <StageTile
      kind="face"
      width={size.w}
      height={size.h}
      tint={desk}
      onPress={openHire}
      label={`Hire for desk ${desk + 1}`}>
      <Center width={size.w} height={size.h}>
        <HStack data-am="desk-hire" gap={2} vAlign="center">
          <Icon icon={Plus} size="sm" color="inherit" />
          <Text type="label" color="inherit">
            Hire
          </Text>
        </HStack>
      </Center>
    </StageTile>
  );
}

/**
 * Every desk's live desktop in a two-by-two, seated like the meeting: desk 1 top-left, 2 top-right, 3 bottom-left,
 * 4 bottom-right. Full window, on the stage's dark ground; Esc or the back control leaves.
 */
export function DesksView() {
  const employees = useStore((s) => s.employees);
  const faces = useStore((s) => s.ui.desksFaces);
  const showRail = useStore((s) => s.ui.desksMessages);
  const threads = useStore((s) => s.threads);
  const win = useWindowSize();
  const dialogOpen = useStore((s) => s.ui.hireOpen || s.ui.settingsOpen || s.ui.summonOpen);
  const { area, rail, railScale } = deskArea(win, showRail);
  const { tile, gap, scale, chipScale } = desksLayout(area);
  const messages = useMemo(() => peerMessages(threads), [threads]);
  const feed = useMemo(() => feedRows(threads), [threads]);
  const managerName = useStore((s) => s.settings?.userName ?? null);
  useExpiry(messages);
  const now = Date.now();
  const bubbles = liveBubbles(messages, now);
  const pulses = livePulses(messages, now);
  const nameOf = (id: string): string => employees.find((e) => e.id === id)?.persona.firstName ?? 'a teammate';
  // Backfill once when the view opens: steps and tasks of every desk, not only the open conversation.
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current) return;
    filled.current = true;
    for (const e of useStore.getState().employees.slice(0, 8)) void useStore.getState().loadThread(e.id);
  }, []);
  const seats = seat(employees, (e) => tintIndex(e.id, e.persona.name, e.persona.portraitUrl));

  useHotkeys([
    { keys: 'escape', allowInInputs: true, isDisabled: dialogOpen, onPress: () => useStore.getState().closeDesks() },
    { keys: 'f', isDisabled: dialogOpen, onPress: () => useStore.getState().setDeskFaces(!useStore.getState().ui.desksFaces) },
    { keys: 'm', isDisabled: dialogOpen, onPress: () => useStore.getState().setDeskMessages(!useStore.getState().ui.desksMessages) },
  ]);

  const cell = (i: number) => {
    const e = seats[i];
    return e ? (
      <VStack key={e.id} data-am-desk-tile={String(i)} data-am-employee={e.id} onClick={() => openThread(e)}>
        <DeskTile employee={e} desk={i} size={tile} faces={faces} bubble={bubbles[e.id]} pulse={pulses[e.id]} nameOf={nameOf} />
      </VStack>
    ) : (
      <VStack key={`hire-${i}`} data-am-desk-tile={String(i)} data-am-hire="" onClick={openHire}>
        <HireTile desk={i} size={tile} />
      </VStack>
    );
  };
  const row = (a: number, b: number) => (
    <HStack>
      {cell(a)}
      <VStack width={gap} height={tile.h}>
        {null}
      </VStack>
      {cell(b)}
    </HStack>
  );

  return (
    <Theme theme={themes[defaultThemeSlug]!} mode="dark">
      <AppShell data-am="stage" contentPadding={0}>
        <Overlay
          position="top"
          align="start"
          scrim={false}
          content={
            <VStack padding={3}>
              <IconButton
                data-am="desks-back"
                label="Back"
                tooltip="Back (Esc)"
                variant="ghost"
                icon={<Icon icon="chevronLeft" size="sm" color="inherit" />}
                onClick={() => useStore.getState().closeDesks()}
              />
            </VStack>
          }>
          <HStack data-am-desks-view="" data-am-scale={String(scale)} data-am-chip-scale={chipScale.toFixed(2)} width={win.w} height={win.h}>
            <Center width={area.w} height={win.h}>
              <VStack>
                {row(0, 1)}
                <VStack width={tile.w * 2 + gap} height={gap}>
                  {null}
                </VStack>
                {row(2, 3)}
              </VStack>
            </Center>
            {showRail ? <MessagesRail messages={feed} employees={employees} managerName={managerName} width={rail} height={win.h} scale={railScale} /> : null}
          </HStack>
        </Overlay>
      </AppShell>
    </Theme>
  );
}
