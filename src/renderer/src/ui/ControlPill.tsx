import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';

/**
 * A pill-shaped surface that holds the call controls. Astryx has Toolbar and Card but no capsule container
 * (ux-spec gap G6); the shape, tone and the circular buttons inside come from `ui/styles/stage.ts`.
 */
export function ControlPill({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HStack data-am="pill" role="toolbar" aria-label={label} gap={1} vAlign="center" hAlign="center" padding={1}>
      {children}
    </HStack>
  );
}
