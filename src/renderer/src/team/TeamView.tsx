import { useEffect, useState } from 'react';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Center } from '@astryxdesign/core/Center';
import { tintIndex } from '../ui/tint';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { StackItem } from '@astryxdesign/core/Stack';
import { Table, useTableSortable, useTableSortableState } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { VStack } from '@astryxdesign/core/VStack';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Search } from 'lucide-react';
import { Icon } from '@astryxdesign/core/Icon';
import type { TeamAskResponse, TeamReport } from '../../../shared';
import { useStore } from '../api/store';
import type { TeamRange } from '../api/store';
import { ApiClientError } from '../api/client';
import { useShot } from '../fixtures/shot';
import { Portrait } from '../ui/Portrait';

const HOUR = 3_600_000;
const ANSWER_ROWS = 5;
const PERIOD: Record<TeamRange, string> = { today: 'yesterday', week: 'last week', month: 'last month' };

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const hours = (ms: number): string => (ms / HOUR).toFixed(1);

function delta(now: number, before: number, format: (n: number) => string, period: string): string {
  const d = now - before;
  if (Math.abs(d) < 0.05) return `Same as ${period}`;
  return `${d > 0 ? '+' : '-'}${format(Math.abs(d))} vs ${period}`;
}

interface Row extends Record<string, unknown> {
  employeeId: string;
  name: string;
  role: string;
  portraitUrl: string;
  hours: number;
  tasksDone: number;
  cost: number;
}

function Figure({ label, value, change }: { label: string; value: string; change: string | null }) {
  return (
    <VStack gap={1}>
      <Text type="supporting">{label}</Text>
      <Text type="display-3" weight="medium" data-am-num="" data-am-figure="">{value}</Text>
      <Text type="supporting" data-am-num="">{change ?? ' '}</Text>
    </VStack>
  );
}

function Figures({ report, range }: { report: TeamReport; range: TeamRange }) {
  const { totals, previous } = report;
  const p = PERIOD[range];
  return (
    <HStack gap={8} vAlign="start">
      <StackItem size="fill">
        <Figure label="Hours worked" value={hours(totals.activeMs)} change={previous ? delta(totals.activeMs / HOUR, previous.activeMs / HOUR, (n) => n.toFixed(1), p) : null} />
      </StackItem>
      <Divider orientation="vertical" />
      <StackItem size="fill">
        <Figure label="Tasks done" value={String(totals.tasksDone)} change={previous ? delta(totals.tasksDone, previous.tasksDone, (n) => String(Math.round(n)), p) : null} />
      </StackItem>
      <Divider orientation="vertical" />
      <StackItem size="fill">
        <Figure label="Cost" value={usd.format(totals.costUsd)} change={previous ? delta(totals.costUsd, previous.costUsd, (n) => usd.format(n), p) : null} />
      </StackItem>
    </HStack>
  );
}

/** Each person's hours against the busiest person's, as a thin bar in their own tint (the one data use of the tint). */
function Share({ row, max }: { row: Row; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((row.hours / max) * 100)) : 0;
  return (
    <HStack data-am-share="" aria-hidden="true" width={56}>
      <Center data-am-share-fill="" data-am-tint={String(tintIndex(row.employeeId, row.name, row.portraitUrl))} width={`${pct}%`} height={4}>
        {null}
      </Center>
    </HStack>
  );
}

function PeopleTable({ report }: { report: TeamReport }) {
  const select = useStore.getState().selectEmployee;
  const maxHours = report.rows.reduce((m, r) => Math.max(m, r.activeMs / HOUR), 0);
  const data: Row[] = report.rows.map((r) => ({
    employeeId: r.employeeId, name: r.name, role: r.role, portraitUrl: r.portraitUrl,
    hours: r.activeMs / HOUR, tasksDone: r.tasksDone, cost: r.costUsd,
  }));
  const { sortedData, sortConfig } = useTableSortableState<Row, string>({
    data,
    defaultSort: [{ sortKey: 'hours', direction: 'descending' }],
    allowUnsortedState: false,
  });
  const sortable = useTableSortable<Row>(sortConfig);
  return (
    <Table
      data={sortedData}
      idKey="employeeId"
      density="compact"
      hasHover
      dividers="rows"
      plugins={{ sortable }}
      columns={[
        {
          key: 'name',
          header: 'Deskmate',
          sortable: true,
          renderCell: (r: Row) => (
            <List density="compact" edge="flush">
              <ListItem
                label={<Text type="label" maxLines={1}>{r.name}</Text>}
                description={r.role}
                startContent={<Portrait person={{ id: r.employeeId, name: r.name, portraitUrl: r.portraitUrl }} size={32} />}
                onClick={() => void select(r.employeeId)}
              />
            </List>
          ),
        },
        {
          key: 'hours',
          header: 'Hours',
          align: 'end',
          sortable: true,
          renderCell: (r: Row) => (
            <HStack gap={3} vAlign="center" hAlign="end">
              <Text hasTabularNumbers>{r.hours.toFixed(1)}</Text>
              <Share row={r} max={maxHours} />
            </HStack>
          ),
        },
        { key: 'tasksDone', header: 'Tasks done', align: 'end', sortable: true, renderCell: (r: Row) => <Text hasTabularNumbers>{String(r.tasksDone)}</Text> },
        { key: 'cost', header: 'Cost', align: 'end', sortable: true, renderCell: (r: Row) => <Text hasTabularNumbers>{usd.format(r.cost)}</Text> },
      ]}
    />
  );
}

function Ask() {
  const shot = useShot()?.params;
  const [question, setQuestion] = useState(shot?.get('ask') === 'answer' ? 'Who closed the most tasks?' : '');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<TeamAskResponse | null>(
    shot?.get('ask') === 'answer'
      ? {
          answer: 'Maya closed the most tasks this week, with 10 of the 25.',
          sql: "SELECT name, SUM(tasks_done) AS tasks FROM team_runs WHERE week = current_week() GROUP BY name ORDER BY tasks DESC",
          columns: ['Deskmate', 'Tasks done'],
          rows: [['Maya Chen', '10'], ['Priya Raman', '5'], ['Jonas Weber', '5'], ['Ines Moreau', '5']],
          conversationId: 'shot',
        }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    try {
      setAnswer(await useStore.getState().askTeam({ question: q }));
    } catch (e) {
      setAnswer(null);
      setError(e instanceof ApiClientError || e instanceof Error ? e.message : "Couldn't get an answer");
    }
    setAsking(false);
  };

  return (
    <VStack gap={3}>
      <TextInput
        label="Ask about your team"
        isLabelHidden
        placeholder="Ask about your team's work"
        startIcon={<Icon icon={Search} size="sm" />}
        value={question}
        onChange={setQuestion}
        onEnter={() => void submit()}
        isLoading={asking}
      />
      {error ? <Banner status="error" title={error} container="section" /> : null}
      {answer ? (
        <VStack gap={2}>
          <Text>{answer.answer}</Text>
          {answer.rows.length > 0 ? (
            <Table
              density="compact"
              dividers="rows"
              data={answer.rows.slice(0, ANSWER_ROWS).map((r, i) => ({ id: String(i), ...Object.fromEntries(answer.columns.map((c, j) => [c, r[j] ?? ''])) }))}
              idKey="id"
              columns={answer.columns.map((c, j) => ({ key: c, header: c, align: j === 0 ? 'start' : 'end' }))}
            />
          ) : null}
          {answer.rows.length > ANSWER_ROWS ? <Text type="supporting">{`and ${answer.rows.length - ANSWER_ROWS} more`}</Text> : null}
          {answer.sql ? (
            <Collapsible defaultIsOpen={false} trigger={<Text type="supporting">Show query</Text>}>
              <Text type="code">{answer.sql}</Text>
            </Collapsible>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}

/** Screenshot mode only: shows states the fixtures do not contain (no work yet, a synced time). */
function shotReport(r: TeamReport | undefined, p: URLSearchParams | undefined): TeamReport | undefined {
  if (!r || !p) return r;
  if (p.get('empty') === '1') return { ...r, rows: [], totals: { activeMs: 0, tasksDone: 0, costUsd: 0 } };
  if (p.get('ask')) return { ...r, source: 'databricks', syncedMs: Date.now() - 2 * 60_000 };
  if (p.get('synced') === '1') {
    return { ...r, source: 'databricks', syncedMs: Date.now() - 2 * 60_000, experimentUrl: 'https://dbc-example.cloud.databricks.com/ml/experiments/1234567890' };
  }
  return r;
}

export function TeamView() {
  const range = useStore((s) => s.teamRange);
  const stored = useStore((s) => s.team[range]);
  const shot = useShot()?.params;
  const report = shotReport(stored, shot);
  const loading = useStore((s) => s.teamLoading);
  const error = useStore((s) => s.teamError);
  const caps = useStore((s) => s.capabilities);
  const loadTeam = useStore.getState().loadTeam;

  useEffect(() => {
    void loadTeam(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const ask = Boolean(caps?.genie);
  const synced = Boolean((caps?.databricks || caps?.genie) && report?.syncedMs);

  let body;
  if (error && !report) {
    body = (
      <Banner
        status="error"
        title="Couldn't load the numbers"
        container="section"
        data-am-banner=""
        endContent={<Button label="Try again" variant="secondary" size="sm" onClick={() => void loadTeam(range)} />}
      />
    );
  } else if (!report) {
    body = loading ? (
      <VStack gap={8}>
        <HStack gap={8}>
          {[0, 1, 2].map((i) => (
            <StackItem key={i} size="fill">
              <VStack gap={2}>
                <Skeleton width={96} height={16} />
                <Skeleton width={140} height={40} />
              </VStack>
            </StackItem>
          ))}
        </HStack>
        <VStack gap={3}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={40} />
          ))}
        </VStack>
      </VStack>
    ) : (
      <Spinner label="Loading" />
    );
  } else if (report.rows.length === 0 || (report.totals.tasksDone === 0 && report.totals.activeMs === 0)) {
    body = <EmptyState title="No work yet" description="Numbers show up once your deskmates start a task." />;
  } else {
    body = (
      <VStack gap={10}>
        <Figures report={report} range={range} />
        <PeopleTable report={report} />
        {ask ? <Ask /> : null}
        {synced && report.syncedMs ? (
          <HStack gap={1} vAlign="center" data-am-num="" data-am-synced="">
            <Text type="supporting">{report.source === 'databricks' ? 'Synced with Databricks ·' : 'Synced ·'}</Text>
            <Timestamp key={report.syncedMs} value={report.syncedMs} format="relative" isLive />
            {report.experimentUrl ? (
              <>
                <Text type="supporting">·</Text>
                <Text type="supporting">
                  <Link href={report.experimentUrl} target="_blank">
                    Open traces
                  </Link>
                </Text>
              </>
            ) : null}
          </HStack>
        ) : null}
      </VStack>
    );
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader data-am-topbar="">
          <HStack gap={4} vAlign="center" data-am-page="" data-am-page-header="">
            <StackItem size="fill">
              <Text type="large">Team</Text>
            </StackItem>
            <SegmentedControl label="Range" value={range} onChange={(v) => void loadTeam(v as TeamRange)}>
              <SegmentedControlItem value="today" label="Today" />
              <SegmentedControlItem value="week" label="Week" />
              <SegmentedControlItem value="month" label="Month" />
            </SegmentedControl>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent isScrollable>
          <VStack padding={6} data-am-page="">
            {body}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
