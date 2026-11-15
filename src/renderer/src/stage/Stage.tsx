import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { ChatComposer } from '@astryxdesign/core/Chat';
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
import { Portrait } from '../ui/Portrait';
import { tintIndex } from '../ui/tint';
import { Captions, useCaptionLine } from './Captions';
import { ControlBar } from './ControlBar';
import type { LayoutChoice } from './ControlBar';
import { buildScenario, realPortraitUrl, stageShot } from './fixtures';
import { BOTTOM_RESERVE, MARK_GAP, TOP_STRIP, gridLayout, oneToOneLayout, spotlightLayout, stageBox } from './layout';
import type { OneToOneLayout } from './layout';
import { useLastSpeaker, useLeftNotice, useRing, useRinging, useThinking } from './signals';
import { DesktopTile, FaceTile } from './Tile';
import type { ChipState } from './Tile';
import { useCall } from './useCall';
import { useWindowSize } from './useWindowSize';

const BANNER_HEIGHT = 44;
const STILL_THINKING_MS = 8000;
const NO_ANSWER_MS = 20000;
const GRID_GAP = 4;
/** Spacing step 10 = 40 px, layout.ts MARK_GAP. */
const MARK_GAP_STEP = 10;
/** Spacing step 3 = 12 px, layout.ts STRIP_GAP. */
const STRIP_GAP = 3;

/** "Maya, Priya, Jonas and Ines". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? 'Meeting') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
  const hasCall = useStore((s) => s.call !== null);
  // After End the app keeps the stage mounted for its 230 ms fade-out (App.tsx, data-am-leaving); show the last frame.
  const lastTree = useRef<ReactNode>(null);
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
      const found = byId(p.employeeId);
      const employee = found && shot?.realPortraits ? { ...found, persona: { ...found.persona, portraitUrl: realPortraitUrl(found.persona.firstName) } } : found;
      return employee ? [{ employee, state: p.state }] : [];
    })
    // Everyone sits at their own desk: tiles in tint order, so a team of four is the Deskmates mark (blue, orange /
    // pink, green). Number keys follow the order on screen.
    .map((p) => ({ ...p, desk: tintIndex(p.employee.id, p.employee.persona.name, p.employee.persona.portraitUrl) }))
    .sort((a, b) => a.desk - b.desk);
  const n = people.length;
  const isMeeting = n >= 2;
  const first = (id: string): string => byId(id)?.persona.firstName ?? '';

  const speakingId = session.speaker.phase === 'speaking' ? session.speaker.employeeId : null;
  const ring = useRing(speakingId);
  const thinking = useThinking(session.speaker, shot?.view.thinkingMs ?? 0);
  const videoOwner = useLastSpeaker(session.speaker.employeeId, people[0]?.employee.id ?? null);
  const lastCaption = session.captions[session.captions.length - 1];
  const userSpeaking = !!lastCaption && lastCaption.from === 'user' && !lastCaption.final && session.speaker.phase !== 'speaking';

  const connecting = useRinging(session.state === 'connecting', !!shot);
  const leftNotice = useLeftNotice(session.participants, first);
  const noAnswerId = thinking.employeeId && thinking.ms >= NO_ANSWER_MS ? thinking.employeeId : null;
  const mutedHint = !session.micOn && !session.micBlocked && userSpeaking;
  // One line under the stage: what someone said, or one short status (the chips carry "Thinking" and "Still thinking").
  const hint = leftNotice ?? (noAnswerId ? `${first(noAnswerId)} didn’t answer` : mutedHint ? 'You’re muted' : null);
  const spoken = useCaptionLine(
    session.captions,
    first,
    hint,
    noAnswerId ? { label: 'Ask again', onClick: () => void useStore.getState().addressCall(noAnswerId) } : undefined,
  );
  const line = connecting ? null : spoken;

  const address = (id: string): void => void useStore.getState().addressCall(id);
  const pinnedPerson = people.find((p) => p.employee.id === pinned);
  const names = people.map((p) => p.employee.persona.firstName);

  const chipFor = (id: string, state: string): ChipState => {
    if (state === 'failed') return { detail: "Couldn't join" };
    if (state === 'joining' || connecting) {
      return isMeeting ? { detail: 'Joining', lead: 'loader' } : { calling: `Calling ${byId(id)?.persona.firstName ?? ''}` };
    }
    if (state === 'dropped') return { detail: 'Reconnecting', lead: 'spinner' };
    if (thinking.employeeId === id) {
      if (thinking.ms >= NO_ANSWER_MS) return { detail: 'No answer' };
      return { detail: thinking.ms >= STILL_THINKING_MS ? 'Still thinking' : 'Thinking', lead: 'spinner' };
    }
    if (ring === id) return { detail: 'Speaking' };
    if (userSpeaking && !isMeeting) return { detail: 'Listening' };
    return { detail: isMeeting ? byId(id)?.persona.role : undefined };
  };

  const face = (p: (typeof people)[number], size: { w: number; h: number }, opts: { onPress?: () => void; onShowDesktop?: boolean } = {}) => {
    const id = p.employee.id;
    const speaking = ring === id;
    const hasVideo = videoOwner === id;
    return (
      <FaceTile
        key={id}
        employee={p.employee}
        size={size}
        chip={chipFor(id, p.state)}
        hasRing={speaking}
        isDropped={connecting || p.state === 'dropped' || p.state === 'joining' || p.state === 'failed'}
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
        data-am-banner=""
        status="error"
        container="section"
        title="Microphone is blocked"
        endContent={<Button label="Open System Settings" variant="secondary" size="sm" href="x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone" />}
      />
    ) : !isMeeting && people[0]?.state === 'dropped' && session.state !== 'failed' ? (
      <Banner data-am-banner="" status="warning" container="section" title="Reconnecting" />
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
          icon={
            n === 1 && people[0] ? (
              <Portrait person={{ id: people[0].employee.id, name: people[0].employee.persona.name, portraitUrl: shot?.noPortraits ? '' : people[0].employee.persona.portraitUrl }} size={96} />
            ) : (
              <HStack data-am="people-stack" vAlign="center">
                {people.map((p) => (
                  <Portrait key={p.employee.id} person={{ id: p.employee.id, name: p.employee.persona.name, portraitUrl: shot?.noPortraits ? '' : p.employee.persona.portraitUrl }} size={56} />
                ))}
              </HStack>
            )
          }
          title={n > 1 ? 'Couldn’t start the meeting' : `Couldn’t reach ${names[0] ?? 'them'}`}
          description="The call didn’t connect. Try again in a moment."
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
      const small = <VStack data-am="inset" padding={4}>{desktopLarge ? faceTile(g.small, true) : desktop(g.small, true)}</VStack>;
      body = (
        <Center height="100%">
          <Overlay position="bottom" align="end" scrim={false} content={small}>
            {large}
          </Overlay>
        </Center>
      );
    } else {
      const composer = (
        <VStack data-am="composer" width={g.composer.w} height={g.composer.h}>
          <ChatComposer
            density="compact"
            elevation="none"
            placeholder={`Message ${p.employee.persona.firstName}`}
            onSubmit={(text) => void useStore.getState().sendMessage(p.employee.id, text)}
          />
        </VStack>
      );
      body =
        g.kind === 'column' ? (
          <Center height="100%">
            <HStack gap={4} vAlign="start">
              {desktop(g.large, false)}
              <VStack gap={3} width={g.column} height={g.row}>
                {faceTile(g.small, true)}
                {composer}
              </VStack>
            </HStack>
          </Center>
        ) : (
          <Center height="100%">
            <VStack gap={3} width={g.large.w} height={g.row}>
              <Overlay position="bottom" align="end" scrim={false} content={<VStack data-am="inset" padding={4}>{desktop(g.small, true)}</VStack>}>
                {faceTile(g.large, false)}
              </Overlay>
              {composer}
            </VStack>
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
          <HStack gap={4} vAlign="start">
            {large}
            {sp.strip.cols === 2 ? (
              <Grid columns={2} gap={STRIP_GAP} width={sp.column ?? sp.strip.tile.w * 2}>
                {strip}
              </Grid>
            ) : (
              <VStack gap={STRIP_GAP} width={sp.column ?? sp.strip.tile.w} height={sp.large.h}>
                {strip}
              </VStack>
            )}
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
        <Grid columns={gl.cols} gap={gl.gap === MARK_GAP ? MARK_GAP_STEP : GRID_GAP} width={gl.cols * gl.tile.w + (gl.cols - 1) * gl.gap}>
          {people.map((p) => face(p, gl.tile, { onShowDesktop: true }))}
        </Grid>
      </Center>
    );
  }

  const title = isMeeting ? listNames(names) : (people[0]?.employee.persona.name ?? '');
  const subtitle = isMeeting ? null : (people[0]?.employee.persona.role ?? null);
  const layouts: LayoutChoice[] = isMeeting
    ? [
        { value: 'grid', label: 'Grid' },
        { value: 'spotlight', label: 'Spotlight', isDisabled: !pinnedPerson },
      ]
    : ONE_TO_ONE_CHOICES;
  const bodyKey = failed ? 'failed' : !isMeeting ? `one:${oneLayout}` : pinnedPerson ? `spot:${pinnedPerson.employee.id}` : `grid:${n}`;

  const tree = (
    <Theme theme={themes[defaultThemeSlug]!} mode="dark">
      <AppShell data-am="stage" contentPadding={0} banner={banner}>
        <Layout
          height="fill"
          padding={0}
          header={
            <LayoutHeader height={TOP_STRIP} padding={0}>
              <HStack data-am="stage-top" height={TOP_STRIP} gap={2} hAlign="center" vAlign="center">
                <Text type="label" maxLines={1}>
                  {title}
                </Text>
                {subtitle ? <Text type="supporting">{subtitle}</Text> : null}
                {session.state === 'live' && !connecting ? <Text type="supporting">{'·'}</Text> : null}
                {session.state === 'live' && !connecting ? <Timer startTime={session.startedMs} format="clock" /> : null}
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={0} isScrollable={false}>
              <VStack data-am="stage-body" key={bodyKey} height="100%">
                {body}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter height={BOTTOM_RESERVE} padding={0}>
              <VStack height="100%" gap={2} hAlign="center" vAlign="start" paddingBlockStart={1}>
                {failed ? null : <Captions line={line} isOn={captionsOn} />}
                {failed ? null : (
                  <ControlBar
                    endOnly={connecting}
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
  if (hasCall || !lastTree.current) lastTree.current = tree;
  return hasCall ? tree : lastTree.current;
}
