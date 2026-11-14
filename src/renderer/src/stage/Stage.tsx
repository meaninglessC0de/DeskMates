import { useLayoutEffect, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout';
import { Overlay } from '@astryxdesign/core/Overlay';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { Timer } from '@astryxdesign/core/Timer';
import { VStack } from '@astryxdesign/core/VStack';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';
import { themes, defaultThemeSlug } from '../theme';
import { Captions, useCaptionLine } from './Captions';
import { ControlBar } from './ControlBar';
import type { LayoutChoice } from './ControlBar';
import { buildScenario, stageShot } from './fixtures';
import { gridLayout, oneToOneLayout, spotlightLayout, stageBox } from './layout';
import type { OneToOneLayout } from './layout';
import { useLastSpeaker, useRing, useThinking } from './signals';
import { DesktopTile, FaceTile } from './Tile';
import type { ChipState } from './Tile';
import { useCall } from './useCall';
import { useWindowSize } from './useWindowSize';

const BANNER_HEIGHT = 44;
const THINKING_HINT_MS = 3000;
const STILL_THINKING_MS = 8000;
const NO_ANSWER_MS = 20000;
const GRID_GAP = 4;
const STRIP_GAP = 3;

/** The one-to-one layout choice lasts across calls (until the app restarts). */
let savedLayout: OneToOneLayout = 'desktop';

const ONE_TO_ONE_CHOICES: LayoutChoice[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'face', label: 'Face' },
  { value: 'side', label: 'Side by side' },
];

/** The dark stage, rendered as the whole app while a call is live. One component for the call and the meeting. */
export function Stage() {
  const shot = stageShot();
  useLayoutEffect(() => {
    if (shot?.scenario) useStore.setState({ call: buildScenario(shot.scenario) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session = useCall();
  const employees = useStore((s) => s.employees);
  const captionsDefault = useStore((s) => s.settings?.captions ?? true);
  const win = useWindowSize();

  const [oneLayout, setOneLayout] = useState<OneToOneLayout>(shot?.view.layout ?? savedLayout);
  const [pinned, setPinned] = useState<string | null>(shot?.view.pinned ?? null);
  const [captionsOn, setCaptionsOn] = useState(captionsDefault);

  const byId = (id: string): Employee | undefined => employees.find((e) => e.id === id);
  const people = session.participants
    .filter((p) => p.state !== 'left')
    .flatMap((p) => {
      const employee = byId(p.employeeId);
      return employee ? [{ employee, state: p.state }] : [];
    });
  const n = people.length;
  const isMeeting = n >= 2;
  const first = (id: string): string => byId(id)?.persona.firstName ?? '';

  const speakingId = session.speaker.phase === 'speaking' ? session.speaker.employeeId : null;
  const ring = useRing(speakingId);
  const thinking = useThinking(session.speaker, shot?.view.thinkingMs ?? 0);
  const videoOwner = useLastSpeaker(session.speaker.employeeId, people[0]?.employee.id ?? null);
  const lastCaption = session.captions[session.captions.length - 1];
  const userSpeaking = !!lastCaption && lastCaption.from === 'user' && !lastCaption.final && session.speaker.phase !== 'speaking';

  const thinkingHint =
    thinking.employeeId && thinking.ms >= THINKING_HINT_MS && thinking.ms < NO_ANSWER_MS ? `${first(thinking.employeeId)} is thinking` : null;
  const line = useCaptionLine(session.captions, first, thinkingHint);

  const address = (id: string): void => void useStore.getState().addressCall(id);
  const pinnedPerson = people.find((p) => p.employee.id === pinned);
  const names = people.map((p) => p.employee.persona.firstName);

  const chipFor = (id: string, name: string, state: string): ChipState => {
    if (state === 'failed') return { text: "Couldn't join" };
    if (state === 'joining' || session.state === 'connecting') return { text: isMeeting ? 'Joining' : `Calling ${name}`, lead: 'spinner' };
    if (state === 'dropped') return { text: 'Reconnecting', lead: 'spinner' };
    if (thinking.employeeId === id) {
      if (thinking.ms >= NO_ANSWER_MS) return { text: 'No answer', action: { label: 'Ask again', onClick: () => address(id) } };
      return { text: thinking.ms >= STILL_THINKING_MS ? 'Still thinking' : 'Thinking', lead: 'spinner' };
    }
    if (userSpeaking && !isMeeting) return { text: 'Listening' };
    return { text: name };
  };

  const face = (p: (typeof people)[number], size: { w: number; h: number }, opts: { onPress?: () => void; onShowDesktop?: boolean } = {}) => {
    const id = p.employee.id;
    const name = p.employee.persona.firstName;
    const speaking = ring === id;
    const hasVideo = videoOwner === id;
    return (
      <FaceTile
        key={id}
        employee={p.employee}
        size={size}
        chip={chipFor(id, name, p.state)}
        hasRing={speaking}
        isDropped={p.state === 'dropped'}
        videoTrack={hasVideo ? session.videoTrack : null}
        audioTrack={hasVideo ? session.audioTrack : null}
        hasPortrait={!!p.employee.persona.portraitUrl && !(shot?.noPortraits ?? false)}
        onPress={opts.onPress ?? (() => address(id))}
        onShowDesktop={opts.onShowDesktop ? () => setPinned(id) : undefined}
        label={`${p.employee.persona.name}${speaking ? ', speaking' : ''}. Press to address`}
      />
    );
  };

  const banner =
    session.micBlocked && session.state !== 'failed' ? (
      <Banner
        status="error"
        container="section"
        title="Microphone is blocked"
        endContent={<Button label="Open System Settings" variant="secondary" size="sm" href="x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone" />}
      />
    ) : !isMeeting && people[0]?.state === 'dropped' && session.state !== 'failed' ? (
      <Banner status="warning" container="section" title="Reconnecting" />
    ) : undefined;

  const box = stageBox(win.w, win.h - (banner ? BANNER_HEIGHT : 0));

  const swap = (): void => {
    if (isMeeting) return;
    const next: OneToOneLayout = oneLayout === 'face' ? 'desktop' : oneLayout === 'desktop' ? 'face' : 'desktop';
    setOneLayout(next);
    savedLayout = next;
  };
  const chooseOne = (v: string): void => {
    setOneLayout(v as OneToOneLayout);
    savedLayout = v as OneToOneLayout;
  };
  const chooseMeeting = (v: string): void => {
    if (v === 'grid') setPinned(null);
    else if (!pinnedPerson && people[0]) setPinned(people[0].employee.id);
  };

  const failed = session.state === 'failed';
  useHotkeys([
    { keys: 'm', onPress: () => !session.micBlocked && session.setMic(!session.micOn), isDisabled: failed },
    { keys: 'c', onPress: () => setCaptionsOn((v) => !v), isDisabled: failed },
    { keys: 'l', onPress: () => (isMeeting ? setPinned(pinnedPerson ? null : (people[0]?.employee.id ?? null)) : chooseOne(oneLayout === 'desktop' ? 'face' : oneLayout === 'face' ? 'side' : 'desktop')), isDisabled: failed },
    { keys: 's', onPress: swap, isDisabled: failed },
    { keys: 'g', onPress: () => setPinned(null), isDisabled: failed },
    { keys: 'mod+.', onPress: () => session.end(), allowInInputs: true },
    ...[0, 1, 2, 3].map((i) => ({ keys: String(i + 1), onPress: () => people[i] && address(people[i]!.employee.id), isDisabled: failed || !isMeeting })),
  ]);

  const retry = (): void => {
    const ids = useStore.getState().call?.employeeIds ?? [];
    void useStore
      .getState()
      .endCall()
      .then(() => useStore.getState().startCall(ids));
  };

  let body;
  if (failed) {
    body = (
      <Center height="100%">
        <EmptyState
          title={n > 1 ? "Couldn't start the meeting" : `Couldn't reach ${names[0] ?? 'them'}`}
          description="Check your connection and try again."
          actions={
            <HStack gap={2}>
              <Button label="Try again" variant="primary" onClick={retry} />
              <Button label="Back to chat" variant="ghost" onClick={session.end} />
            </HStack>
          }
        />
      </Center>
    );
  } else if (n === 0) {
    body = null;
  } else if (!isMeeting) {
    const p = people[0]!;
    const g = oneToOneLayout(oneLayout, win.w, win.h - (banner ? BANNER_HEIGHT : 0));
    const desktopLarge = oneLayout === 'desktop';
    const desktop = (size: { w: number; h: number }, secondary: boolean) => (
      <DesktopTile employee={p.employee} size={size} chipText={`${p.employee.persona.firstName}'s desktop`} onSwap={secondary ? swap : undefined} />
    );
    const faceTile = (size: { w: number; h: number }, secondary: boolean) => face(p, size, { onPress: secondary ? swap : undefined });
    if (g.kind === 'side') {
      body = (
        <Center height="100%">
          <HStack gap={4} vAlign="center">
            {desktop(g.large, false)}
            {faceTile(g.small, false)}
          </HStack>
        </Center>
      );
    } else if (g.kind === 'inset') {
      const large = desktopLarge ? desktop(g.large, false) : faceTile(g.large, false);
      const small = <VStack padding={4}>{desktopLarge ? faceTile(g.small, true) : desktop(g.small, true)}</VStack>;
      body = (
        <Center height="100%">
          <Overlay position="bottom" align="end" scrim={false} content={small}>
            {large}
          </Overlay>
        </Center>
      );
    } else {
      body = (
        <Center height="100%">
          <HStack gap={4} vAlign="center">
            {desktopLarge ? desktop(g.large, false) : faceTile(g.large, false)}
            {desktopLarge ? faceTile(g.small, true) : desktop(g.small, true)}
          </HStack>
        </Center>
      );
    }
  } else if (pinnedPerson) {
    const sp = spotlightLayout(n, box, 'desktop');
    const large = (
      <DesktopTile
        employee={pinnedPerson.employee}
        size={sp.large}
        chipText={`${pinnedPerson.employee.persona.firstName}'s desktop`}
        onClose={() => setPinned(null)}
      />
    );
    const strip = people.map((p) => face(p, sp.strip.tile, { onShowDesktop: true }));
    body = (
      <Center height="100%">
        {sp.strip.orientation === 'vertical' ? (
          <HStack gap={4} vAlign="center">
            {large}
            <VStack gap={STRIP_GAP}>{strip}</VStack>
          </HStack>
        ) : (
          <VStack gap={4} hAlign="center">
            {large}
            <HStack gap={STRIP_GAP}>{strip}</HStack>
          </VStack>
        )}
      </Center>
    );
  } else {
    const gl = gridLayout(n, box);
    body = (
      <Center height="100%">
        <Grid columns={gl.cols} gap={GRID_GAP} width={gl.cols * gl.tile.w + (gl.cols - 1) * 16}>
          {people.map((p) => face(p, gl.tile, { onShowDesktop: true }))}
        </Grid>
      </Center>
    );
  }

  const title = isMeeting ? 'Meeting' : (people[0]?.employee.persona.name ?? '');
  const mutedHint = !session.micOn && !session.micBlocked && userSpeaking;
  const layouts: LayoutChoice[] = isMeeting
    ? [
        { value: 'grid', label: 'Grid' },
        { value: 'spotlight', label: 'Spotlight', isDisabled: !pinnedPerson },
      ]
    : ONE_TO_ONE_CHOICES;

  return (
    <Theme theme={themes[defaultThemeSlug]!} mode="dark">
      <AppShell contentPadding={0} banner={banner}>
        <Layout
          height="fill"
          padding={0}
          header={
            <LayoutHeader height={48} padding={0}>
              <HStack height={48} gap={2} hAlign="center" vAlign="center">
                <Text type="label">{title}</Text>
                {session.state === 'live' ? <Text type="supporting">{'·'}</Text> : null}
                {session.state === 'live' ? <Timer startTime={session.startedMs} format="clock" /> : null}
                {mutedHint ? <Text type="supporting">{'· You’re muted'}</Text> : null}
              </HStack>
            </LayoutHeader>
          }
          content={<LayoutContent padding={0} isScrollable={false}>{body}</LayoutContent>}
          footer={
            <LayoutFooter height={104} padding={0}>
              <VStack height="100%" gap={2} hAlign="center" vAlign="center">
                {failed ? null : <Captions line={line} isOn={captionsOn} />}
                {failed ? null : (
                <ControlBar
                  endOnly={session.state === 'connecting'}
                  micOn={session.micOn}
                  micBlocked={session.micBlocked}
                  onMic={session.setMic}
                  captionsOn={captionsOn}
                  onCaptions={setCaptionsOn}
                  layout={isMeeting ? (pinnedPerson ? 'spotlight' : 'grid') : oneLayout}
                  layouts={layouts}
                  onLayout={isMeeting ? chooseMeeting : chooseOne}
                  onEnd={session.end}
                />
                )}
              </VStack>
            </LayoutFooter>
          }
        />
      </AppShell>
    </Theme>
  );
}
