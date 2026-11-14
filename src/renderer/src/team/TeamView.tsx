import { useEffect } from 'react';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Center } from '@astryxdesign/core/Center';
import { useStore } from '../api/store';

/** Placeholder. Loads `team[teamRange]` with `loadTeam` and shows its totals. */
export function TeamView() {
  const range = useStore((s) => s.teamRange);
  const report = useStore((s) => s.team[range]);
  const loading = useStore((s) => s.teamLoading);
  const error = useStore((s) => s.teamError);

  useEffect(() => {
    void useStore.getState().loadTeam(range);
  }, [range]);

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent>
          {error ? (
            <EmptyState title={error} />
          ) : report ? (
            <EmptyState title="Team" description={`${report.rows.length} people, ${report.totals.tasksDone} tasks done (${report.range})`} />
          ) : loading ? (
            <Center height="100%">
              <Spinner label="Loading" />
            </Center>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </LayoutContent>
      }
    />
  );
}
