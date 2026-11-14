export const shots: { name: string; query?: string }[] = [
  { name: 'today', query: 'range=today&portraits=none' },
  { name: 'week', query: 'range=week&portraits=none' },
  { name: 'month', query: 'range=month&portraits=none' },
  { name: 'week-ask', query: 'range=week&caps=genie,databricks&ask=box&portraits=none' },
  { name: 'week-answer', query: 'range=week&caps=genie,databricks&ask=answer&portraits=none' },
  { name: 'loading', query: 'team=loading&portraits=none' },
  { name: 'error', query: 'team=error&portraits=none' },
  { name: 'empty', query: 'range=week&empty=1&portraits=none' },
];
