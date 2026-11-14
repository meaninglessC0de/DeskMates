export const shots: { name: string; query?: string }[] = [
  { name: 'step-1' },
  { name: 'step-1-describe', query: 'describe=1' },
  { name: 'step-1-full', query: 'full=1' },
  { name: 'step-2-loading', query: 'step=meet&role=writer&state=loading' },
  { name: 'step-2', query: 'step=meet&role=writer' },
  { name: 'step-2-hear', query: 'step=meet&role=data_analyst&hear=1' },
  { name: 'step-2-edit', query: 'step=meet&role=writer&edit=1' },
];
