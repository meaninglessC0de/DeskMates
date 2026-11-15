import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Center } from '@astryxdesign/core/Center';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import {
  BarChart3, Briefcase, ChevronLeft, ChevronRight, ClipboardList, Code2, FileText, Handshake, Megaphone,
  PenTool, Pencil, Play, Plus, Search, Shuffle, Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Candidate, PermissionLevel, RolePreset } from '../../../shared';
import { useStore } from '../api/store';
import { ApiClientError } from '../api/client';
import { useShot } from '../fixtures/shot';
import { Portrait } from '../ui/Portrait';

export interface HireDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const ROLE_ICONS: Record<string, LucideIcon> = {
  Code2, Megaphone, Search, PenTool, BarChart3, ClipboardList, Handshake, FileText,
};

const TEAM_FULL = 'Your team is full. Remove someone to hire again.';
const MIN_DESCRIPTION = 8;

const LEVELS: { value: PermissionLevel; label: string; description: string }[] = [
  { value: 'asks_first', label: 'Asks first', description: 'Checks with you before anything that changes something.' },
  { value: 'asks_big_steps', label: 'Asks before big steps', description: 'Checks before deploying, spending, sending or deleting.' },
  { value: 'independent', label: 'Works independently', description: 'Only stops when it is stuck.' },
];

const firstName = (c: Candidate): string => c.persona.firstName || c.persona.name.split(' ')[0] || c.persona.name;

/** What the user sees for a failed API call: the server's plain sentence, with the team-full line fixed. */
function messageOf(e: unknown): { text: string; full: boolean } {
  if (e instanceof ApiClientError) return { text: e.code === 'team_full' ? TEAM_FULL : e.message, full: e.code === 'team_full' };
  return { text: e instanceof Error ? e.message : 'Try again in a moment.', full: false };
}

export function HireDialog({ isOpen, onOpenChange }: HireDialogProps) {
  const presets = useStore((s) => s.presets);
  const shot = useShot()?.params;

  const [step, setStep] = useState<'roles' | 'meet'>('roles');
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [level, setLevel] = useState<PermissionLevel>('asks_big_steps');
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stopAudio = (): void => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  };

  const show = (c: Candidate, preset?: RolePreset): void => {
    setCandidate(c);
    setName(c.persona.name);
    setPersonality(c.persona.personality);
    if (preset) setLevel(preset.defaultPermissions.level);
    setSeen((s) => (s.includes(c.token) ? s : [...s, c.token]));
  };

  const pick = async (key: string, text?: string, preset?: RolePreset): Promise<void> => {
    setRoleKey(key);
    setError(null);
    setFull(false);
    setStep('meet');
    setLoading(true);
    if (shot?.get('state') === 'loading') return;
    try {
      const c = await useStore.getState().fetchCandidate({ roleKey: key, ...(text ? { description: text } : {}) });
      show(c, preset);
      setLoading(false);
    } catch (e) {
      const m = messageOf(e);
      setStep('roles');
      setLoading(false);
      setError(m.text);
      setFull(m.full);
    }
  };

  const shuffle = async (): Promise<void> => {
    if (!candidate) return;
    setShuffling(true);
    setError(null);
    stopAudio();
    try {
      const c = await useStore.getState().fetchCandidate({
        roleKey,
        ...(roleKey === 'custom' && description ? { description: description.trim() } : {}),
        exclude: seen,
      });
      show(c);
    } catch (e) {
      setError(messageOf(e).text);
    }
    setShuffling(false);
  };

  const hire = async (): Promise<void> => {
    if (!candidate) return;
    setHiring(true);
    setError(null);
    stopAudio();
    const edited = name.trim() !== candidate.persona.name || personality.trim() !== candidate.persona.personality;
    try {
      await useStore.getState().hire({
        token: candidate.token,
        overrides: {
          ...(edited ? { name: name.trim() || candidate.persona.name, personality: personality.trim() || candidate.persona.personality } : {}),
          permissions: { level },
        },
      });
    } catch (e) {
      setError(messageOf(e).text);
    }
    setHiring(false);
  };

  const hear = (): void => {
    const url = candidate?.persona.voice.sampleUrl;
    if (!url) return;
    if (playing) {
      stopAudio();
      return;
    }
    const a = new Audio(url);
    a.onended = () => setPlaying(false);
    a.onerror = () => setPlaying(false);
    audio.current = a;
    setPlaying(true);
    void a.play().catch(() => setPlaying(false));
  };

  const back = (): void => {
    stopAudio();
    setStep('roles');
    setCandidate(null);
    setEditing(false);
    setError(null);
  };

  // Fresh state each time the dialog opens; shots can start on step 2 or with a variant.
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      return;
    }
    setStep('roles');
    setDescribing(shot?.get('describe') === '1');
    setDescription('');
    setCandidate(null);
    setSeen([]);
    setLoading(false);
    setHiring(false);
    setEditing(shot?.get('edit') === '1');
    setError(shot?.get('full') === '1' ? TEAM_FULL : null);
    setFull(shot?.get('full') === '1');
    if (shot?.get('step') === 'meet') {
      const key = shot.get('role') ?? presets[0]?.key ?? 'web_developer';
      void pick(key, undefined, presets.find((p) => p.key === key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sampleUrl = candidate?.persona.voice.sampleUrl ?? (shot?.get('hear') === '1' ? '/media/voices/sample.mp3' : null);
  const who = candidate ? firstName(candidate) : '';
  const meeting = step === 'meet';

  const header = meeting ? (
    <DialogHeader
      title={loading || !candidate ? 'Meet your hire' : `Meet ${who}`}
      onOpenChange={onOpenChange}
      startContent={
        <VStack height={16} vAlign="center" hAlign="center">
          <IconButton label="Back" tooltip="Back" variant="ghost" size="sm" icon={<Icon icon={ChevronLeft} size="sm" />} onClick={back} />
        </VStack>
      }
    />
  ) : (
    <DialogHeader title="Hire" onOpenChange={onOpenChange} />
  );

  const roles = (
    <VStack gap={3}>
      {error ? <Banner status={full ? 'info' : 'error'} title={error} container="section" /> : null}
      <List density="balanced" edge="flush">
        {presets.map((p) => {
          const RoleIcon = ROLE_ICONS[p.icon] ?? Briefcase;
          return (
            <ListItem
              key={p.key}
              label={<Text type="label">{p.role}</Text>}
              description={p.blurb}
              startContent={
                <Center data-am-tile="" width={36} height={36}>
                  <Icon icon={RoleIcon} size="sm" />
                </Center>
              }
              endContent={<Icon icon={ChevronRight} size="sm" color="secondary" />}
              onClick={() => void pick(p.key, undefined, p)}
            />
          );
        })}
      </List>
      <Divider />
      {describing ? (
        <VStack gap={3}>
          <TextArea
            label="Describe a role"
            isLabelHidden
            rows={3}
            hasAutoFocus
            placeholder="Describe the role in a sentence"
            value={description}
            onChange={setDescription}
          />
          <HStack hAlign="end">
            <Button
              label="Continue"
              variant="primary"
              isDisabled={description.trim().length < MIN_DESCRIPTION}
              onClick={() => void pick('custom', description.trim())}
            />
          </HStack>
        </VStack>
      ) : (
        <List density="balanced" edge="flush">
          <ListItem
            label="Describe a role"
            startContent={
              <Center data-am-tile="" width={36} height={36}>
                <Icon icon={Plus} size="sm" />
              </Center>
            }
            onClick={() => setDescribing(true)}
          />
        </List>
      )}
    </VStack>
  );

  const proposal = (
    <VStack gap={6} hAlign="center" paddingBlockStart={4}>
      {loading || !candidate ? (
        <VStack gap={4} hAlign="center" padding={4}>
          <Skeleton width={144} height={144} radius="rounded" />
          <HStack gap={2} vAlign="center">
            <Spinner size="sm" />
            <Text type="supporting">Finding the right person</Text>
          </HStack>
        </VStack>
      ) : (
        <>
          <VStack gap={1} hAlign="center" data-am-identity="" key={candidate.persona.name}>
            <Portrait person={{ id: candidate.persona.name, name: candidate.persona.name, portraitUrl: candidate.persona.portraitUrl }} size={144} />
            <VStack gap={0.5} hAlign="center" paddingBlockStart={5}>
              <Text type="display-3">{name.trim() || candidate.persona.name}</Text>
              <Text type="supporting">{candidate.persona.role}</Text>
            </VStack>
            <VStack hAlign="center" paddingBlockStart={3} maxWidth={360}>
              <Text type="body" color="secondary" justify="center">{personality.trim() || candidate.persona.personality}</Text>
            </VStack>
          </VStack>
          <HStack gap={2} vAlign="center" hAlign="center">
            {sampleUrl ? (
              <Button
                label={playing ? 'Playing' : `Hear ${who}`}
                variant="ghost"
                icon={<Icon icon={playing ? Square : Play} size="sm" />}
                onClick={hear}
              />
            ) : null}
            <Button label="Shuffle" variant="ghost" icon={<Icon icon={Shuffle} size="sm" />} isLoading={shuffling} onClick={() => void shuffle()} />
            <Button label="Edit" variant="ghost" icon={<Icon icon={Pencil} size="sm" />} onClick={() => setEditing((v) => !v)} />
          </HStack>
          {editing ? (
            <VStack gap={4} width="100%">
              <TextInput label="Name" value={name} onChange={setName} />
              <TextArea label="Personality" rows={2} maxLength={280} value={personality} onChange={setPersonality} />
              <RadioList label="Permissions" value={level} onChange={(v) => setLevel(v as PermissionLevel)}>
                {LEVELS.map((l) => (
                  <RadioListItem key={l.value} value={l.value} label={l.label} description={l.description} />
                ))}
              </RadioList>
            </VStack>
          ) : null}
          {error ? <Banner status="error" title={error} container="section" /> : null}
        </>
      )}
    </VStack>
  );

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={560} purpose="form">
      <Layout
        height="fill"
        header={header}
        content={<LayoutContent isScrollable>{meeting ? proposal : roles}</LayoutContent>}
        footer={
          meeting ? (
            <LayoutFooter>
              <HStack hAlign="center" data-am-hire-footer="">
                <Button
                  label={candidate && !loading ? `Hire ${who}` : 'Hire'}
                  variant="primary"
                  isLoading={hiring}
                  isDisabled={!candidate || loading || shuffling}
                  onClick={() => void hire()}
                />
              </HStack>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
