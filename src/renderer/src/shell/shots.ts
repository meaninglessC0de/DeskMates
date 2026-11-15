export const shots: { name: string; query?: string }[] = [
  { name: 'sidebar' },
  { name: 'sidebar-monogram', query: 'portraits=none' },
  { name: 'sidebar-stuck', query: 'select=jonas&as=stuck' },
  { name: 'first-run', query: 'employees=none' },
  { name: 'loading', query: 'boot=loading' },
  { name: 'error', query: 'boot=error' },
  { name: 'lent', query: 'lent=1' },
  { name: 'lent-forever', query: 'lent=forever&open=desktop' },
];
