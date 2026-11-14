import { ulid } from 'ulid';
import type { TeamAskResponse, TeamReport } from '../../shared/index.ts';
import { computeTeamReport } from './team.ts';
import { SyncError, type Sync, type SyncDeps, type SyncStatus, type SyncTable } from './types.ts';

/** Databricks off: local numbers only. With MOCK_GENIE=1 the Ask box answers with a fixed shape built from local data. */
export function createLocalSync(deps: SyncDeps): Sync {
  const mockGenie = deps.env.MOCK_GENIE;
  return {
    status(): SyncStatus {
      return { databricks: false, genie: mockGenie, syncedMs: null };
    },
    record(_table: SyncTable, _row: unknown) {},
    async teamReport(range: TeamReport['range']) {
      return computeTeamReport(deps.data, range);
    },
    async ask(question: string, conversationId?: string): Promise<TeamAskResponse> {
      if (!mockGenie) throw new SyncError(409, 'genie_off', 'Ask is not set up. Add Databricks keys to use it.');
      const report = computeTeamReport(deps.data, 'week');
      const top = report.rows[0];
      const hours = (ms: number) => (ms / 3_600_000).toFixed(1);
      return {
        answer: top
          ? `${top.name.split(' ')[0]} has been the busiest this week, with ${hours(top.activeMs)} hours of work. You asked: ${question}`
          : 'There is no work recorded yet this week.',
        sql: 'SELECT name, SUM(active_ms) / 3600000 AS hours FROM tasks WHERE finished_ms >= :week_start GROUP BY name ORDER BY hours DESC',
        columns: ['Name', 'Hours', 'Tasks done'],
        rows: report.rows.map((r) => [r.name, hours(r.activeMs), String(r.tasksDone)]),
        conversationId: conversationId ?? `conv_${ulid()}`,
      };
    },
    async boot() {},
    async stop() {},
  };
}
