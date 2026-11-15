import { useEffect, useRef, useState } from 'react';
import { useStreamingText } from '@astryxdesign/core/hooks';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import type { Caption } from '../api/store';
import { stageShot } from './fixtures';

const SILENCE_MS = 3000;
const MAX_CHARS = 96;
const ROW_HEIGHT = 32;
const MAX_WIDTH = 720;

export type CaptionLine =
  | { kind: 'speech'; name: string | null; text: string; isUser: boolean; streaming: boolean }
  | { kind: 'hint'; text: string; action?: { label: string; onClick: () => void } };

/** Newest words always show: cut from the left at a word boundary. */
export function tail(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const space = cut.indexOf(' ');
  return `…${space > 0 && space < 24 ? cut.slice(space + 1) : cut}`;
}

/**
 * The one caption line: the latest caption, hidden after 3 s without a change.
 * `hint` (for example "Maya is thinking") replaces it while it applies.
 */
export function useCaptionLine(
  captions: Caption[],
  nameOf: (id: string) => string,
  hint: string | null,
  hintAction?: { label: string; onClick: () => void },
): CaptionLine | null {
  const last = captions[captions.length - 1];
  const [quiet, setQuiet] = useState(false);
  const key = last ? `${last.id}:${last.text.length}:${last.final}` : '';
  useEffect(() => {
    setQuiet(false);
    if (!last || stageShot()) return;
    const t = setTimeout(() => setQuiet(true), SILENCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (hint) return { kind: 'hint', text: hint, action: hintAction };
  if (!last || quiet) return null;
  const isUser = last.from === 'user';
  return { kind: 'speech', name: isUser ? 'You' : nameOf(last.from), text: last.text, isUser, streaming: !last.final };
}

function Speech({ line }: { line: Extract<CaptionLine, { kind: 'speech' }> }) {
  const shown = useStreamingText(line.text, line.streaming && !stageShot());
  return (
    <HStack gap={2} vAlign="center" hAlign="center" maxWidth={MAX_WIDTH}>
      {line.name ? (
        <Text type="supporting" color="secondary">
          {line.name}
        </Text>
      ) : null}
      <Text data-am="caption-text" type="large" color={line.isUser ? 'secondary' : 'primary'} maxLines={1}>
        {tail(shown)}
      </Text>
    </HStack>
  );
}

/**
 * The caption row keeps its height when empty or off, so nothing above it moves. After silence the last line
 * stays in place and fades out (`data-am-shown`) instead of disappearing at once.
 */
export function Captions({ line, isOn }: { line: CaptionLine | null; isOn: boolean }) {
  const last = useRef<CaptionLine | null>(line);
  if (line) last.current = line;
  const kept = isOn ? last.current : null;
  return (
    <HStack
      data-am="caption"
      data-am-shown={isOn && line ? 'on' : 'off'}
      height={ROW_HEIGHT}
      hAlign="center"
      vAlign="center"
      maxWidth={MAX_WIDTH}
      width="100%"
      aria-live={isOn ? 'polite' : 'off'}>
      {!kept ? null : kept.kind === 'hint' ? (
        <HStack gap={3} vAlign="center">
          <Text type="label" color="secondary">
            {kept.text}
          </Text>
          {kept.action ? <Button label={kept.action.label} variant="secondary" size="sm" onClick={kept.action.onClick} /> : null}
        </HStack>
      ) : (
        <Speech line={kept} />
      )}
    </HStack>
  );
}
