export const shots: { name: string; query?: string }[] = [
  { name: 'today', query: 'range=today' },
  { name: 'week', query: 'range=week' },
  { name: 'week-monogram', query: 'range=week&portraits=none' },
  { name: 'month', query: 'range=month' },
  { name: 'week-synced', query: 'range=week&caps=databricks&synced=1' },
  { name: 'week-ask', query: 'range=week&caps=genie,databricks&ask=box' },
  { name: 'week-answer', query: 'range=week&caps=genie,databricks&ask=answer' },
  { name: 'loading', query: 'team=loading' },
  { name: 'error', query: 'team=error' },
  { name: 'empty', query: 'range=week&empty=1' },
];
