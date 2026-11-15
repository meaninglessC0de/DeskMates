import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

export interface StageChipProps {
  /** The person's first name, or "Maya's desktop". */
  name: string;
  /** One quiet word after the name: the role in a meeting, or the state ("Speaking", "Thinking", "Listening"). */
  detail?: string;
  /** A small thing before the name: a spinner while thinking or joining. */
  lead?: ReactNode;
  /** A quiet action after the words: "Ask again", the spotlight's close. */
  end?: ReactNode;
}

/**
 * The label in a stage tile's bottom-left corner: a small translucent capsule that reads on a photo, a video, a
 * desktop and a tint wash alike. Astryx's Token is a tag (fixed tone, no secondary text); this pairs the name in
 * label weight with one supporting word and blurs what is behind it.
 */
export function StageChip({ name, detail, lead, end }: StageChipProps) {
  return (
    <HStack data-am="chip" gap={1.5} vAlign="center">
      {lead}
      <Text type="label" color="primary" maxLines={1}>
        {name}
      </Text>
      {detail ? (
        <Text type="supporting" color="secondary" maxLines={1}>
          {detail}
        </Text>
      ) : null}
      {end}
    </HStack>
  );
}
