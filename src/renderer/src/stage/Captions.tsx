import { useEffect, useState } from 'react';
import { useStreamingText } from '@astryxdesign/core/hooks';
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
  | { kind: 'hint'; text: string };

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
export function useCaptionLine(captions: Caption[], nameOf: (id: string) => string, hint: string | null): CaptionLine | null {
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
  if (hint) return { kind: 'hint', text: hint };
  if (!last || quiet) return null;
  const isUser = last.from === 'user';
  return { kind: 'speech', name: isUser ? 'You' : nameOf(last.from), text: last.text, isUser, streaming: !last.final };
}

function Speech({ line }: { line: Extract<CaptionLine, { kind: 'speech' }> }) {
  const shown = useStreamingText(line.text, line.streaming && !stageShot());
  return (
    <HStack gap={2} vAlign="center" hAlign="center" maxWidth={MAX_WIDTH}>
      {line.name ? (
        <Text type="label" color={line.isUser ? 'secondary' : 'primary'}>
          {line.name}
        </Text>
      ) : null}
      <Text type="body" size="lg" color={line.isUser ? 'secondary' : 'primary'} maxLines={1}>
        {tail(shown)}
      </Text>
    </HStack>
  );
}

/** The caption row keeps its height when empty or off, so nothing above it moves. */
export function Captions({ line, isOn }: { line: CaptionLine | null; isOn: boolean }) {
  return (
    <HStack height={ROW_HEIGHT} hAlign="center" vAlign="center" maxWidth={MAX_WIDTH} width="100%" aria-live={isOn ? 'polite' : 'off'}>
      {!isOn || !line ? null : line.kind === 'hint' ? <Text type="supporting">{line.text}</Text> : <Speech line={line} />}
    </HStack>
  );
}
