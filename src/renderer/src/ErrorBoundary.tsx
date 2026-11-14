import { Component } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';

interface State { failed: boolean }

/** The only class component. Renders "Something went wrong"; scripts/shots.ts fails on that text. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Center height="100vh">
        <EmptyState
          title="Something went wrong"
          actions={<Button label="Reload" variant="primary" onClick={() => location.reload()} />}
        />
      </Center>
    );
  }
}
