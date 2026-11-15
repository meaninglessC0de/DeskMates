import { useState } from 'react';
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
import { StageChip } from '../ui/StageChip';
import { StageTile } from '../ui/StageTile';
import { tintIndex } from '../ui/tint';
import { desksLayout, seat } from './layout';
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
  // The stream has not started: the brand loader over the tile, gone as soon as frames arrive.
  const waiting = state === 'connecting';
  return (
    <Overlay
      position="fill"
      scrim={false}
      content={
        waiting ? (
          <Center data-am="desk-wait" width={size.w} height={size.h}>
            {loader}
          </Center>
        ) : null
      }>
      <Center width={size.w} height={size.h}>
        <VStack width={size.w}>
          <SpaceView employeeId={employee.id} mode="view" onState={setState} />
        </VStack>
      </Center>
    </Overlay>
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

function DeskTile({ employee, desk, size, faces }: { employee: Employee; desk: number; size: Size; faces: boolean }) {
  const first = employee.persona.firstName;
  const open = (): void => {
    const s = useStore.getState();
    s.toggleDesktop(employee.id, true);
    void s.selectEmployee(employee.id);
  };
  return (
    <StageTile
      kind="desktop"
      width={size.w}
      height={size.h}
      hasMedia
      onPress={open}
      label={`Desk ${desk + 1}, ${first}`}
      chip={<StageChip name={`Desk ${desk + 1} · ${first}`} />}>
      <Overlay position="top" align="end" scrim={false} content={faces ? <Face employee={employee} desk={desk} /> : null}>
        <Screen employee={employee} size={size} />
      </Overlay>
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
      onPress={() => useStore.getState().setUi({ hireOpen: true })}
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
  const win = useWindowSize();
  const { tile, gap, scale } = desksLayout(win);
  const seats = seat(employees, (e) => tintIndex(e.id, e.persona.name, e.persona.portraitUrl));

  useHotkeys([
    { keys: 'escape', allowInInputs: true, onPress: () => useStore.getState().closeDesks() },
    { keys: 'f', onPress: () => useStore.getState().setDeskFaces(!useStore.getState().ui.desksFaces) },
  ]);

  const cell = (i: number) => {
    const e = seats[i];
    return e ? (
      <VStack key={e.id} data-am-desk-tile={String(i)} data-am-employee={e.id}>
        <DeskTile employee={e} desk={i} size={tile} faces={faces} />
      </VStack>
    ) : (
      <VStack key={`hire-${i}`} data-am-desk-tile={String(i)} data-am-hire="">
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
          <Center data-am-desks-view="" data-am-scale={String(scale)} width={win.w} height={win.h}>
            <VStack>
              {row(0, 1)}
              <VStack width={tile.w * 2 + gap} height={gap}>
                {null}
              </VStack>
              {row(2, 3)}
            </VStack>
          </Center>
        </Overlay>
      </AppShell>
    </Theme>
  );
}
