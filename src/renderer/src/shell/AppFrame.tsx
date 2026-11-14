import type { ReactNode } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Sidebar } from './Sidebar';

export interface AppFrameProps {
  /** The main column: Conversation, TeamView or FirstRun. */
  children: ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
  return (
    <AppShell variant="elevated" contentPadding={0} sideNav={<Sidebar />}>
      {children}
    </AppShell>
  );
}
