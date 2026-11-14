export const shots: { name: string; query?: string }[] = [
  { name: 'default' },
  { name: 'connections-all', query: 'caps=databricks,genie,calls_avatar,cua' },
  { name: 'connections-none', query: 'caps=nollm,calls_off' },
];
