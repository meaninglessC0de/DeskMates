import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { Theme } from '@astryxdesign/core/theme';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { themes, defaultThemeSlug } from '../theme';
import { SpaceView } from './SpaceView';
import type { SpaceState } from './SpaceView';

/** Test page: mounts only SpaceView against the real API (no fixtures). `?id=<employee>&mode=view|control`. */
declare global {
  interface Window { __space?: { state: SpaceState; fallback: string | null } }
}

function Live() {
  const q = new URLSearchParams(location.search);
  const id = q.get('id') ?? 'test';
  const mode = q.get('mode') === 'control' ? 'control' : 'view';
  const [state, setState] = useState<SpaceState>('connecting');
  window.__space ??= { state: 'connecting', fallback: null };
  return (
    <VStack gap={3} padding={4}>
      <Text>{`${id} · ${mode} · ${state}`}</Text>
      <SpaceView
        employeeId={id}
        mode={mode}
        onState={(s) => {
          window.__space!.state = s;
          setState(s);
        }}
        onFallback={(r) => {
          window.__space!.fallback = r;
        }}
      />
    </VStack>
  );
}

createRoot(document.getElementById('root')!).render(
  <Theme theme={themes[defaultThemeSlug]!}>
    <Live />
  </Theme>,
);
