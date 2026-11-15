export const shots: { name: string; query?: string }[] = [
  { name: 'open' },
  { name: 'working', query: 'select=priya' },
  { name: 'in-control', query: 'select=priya&control=1' },
  { name: 'lend', query: 'select=priya&myscreen=1&popover=lend' },
  { name: 'lent', query: 'lent=1' },
  { name: 'connecting', query: 'select=priya&screen=connecting' },
  { name: 'cant-show', query: 'select=priya&screen=error' },
  { name: 'starting', query: 'select=priya&as=starting' },
  { name: 'offline', query: 'select=jonas&as=offline' },
  { name: 'no-plan', query: 'select=jonas&plan=none' },
  { name: 'expanded', query: 'select=priya&expand=1' },
];
