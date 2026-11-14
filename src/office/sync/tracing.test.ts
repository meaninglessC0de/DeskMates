import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV = { MLFLOW_EXPERIMENT_ID: '123', DATABRICKS_HOST: 'https://dbc-1.cloud.databricks.com/', DATABRICKS_TOKEN: 'dapi', MLFLOW_TRACKING_URI: 'databricks' };

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@mlflow/core');
  vi.doUnmock('@mlflow/claude-code');
});

async function fresh() {
  vi.resetModules();
  return import('./tracing.ts');
}

describe('tracing', () => {
  it('is the identity when unconfigured', async () => {
    const t = await fresh();
    const q = () => 'plain';
    t.resetTracing();
    expect(t.tracedQuery(q)).toBe(q);
    t.resetTracing();
    await t.warmTracing({ MLFLOW_EXPERIMENT_ID: '123' }); // no Databricks variables
    expect(t.tracedQuery(q)).toBe(q);
    expect(t.experimentUrl({ MLFLOW_EXPERIMENT_ID: '123' })).toBeNull();
  });

  it('builds the experiment link', async () => {
    const t = await fresh();
    expect(t.experimentUrl(ENV)).toBe('https://dbc-1.cloud.databricks.com/ml/experiments/123');
  });

  it('wraps the query with createTracedQuery once MLflow is loaded', async () => {
    const init = vi.fn();
    const createTracedQuery = vi.fn((q: (x: string) => string) => (x: string) => `traced:${q(x)}`);
    vi.doMock('@mlflow/core', () => ({ init }));
    vi.doMock('@mlflow/claude-code', () => ({ createTracedQuery }));
    const t = await fresh();
    await t.warmTracing(ENV);
    const q = (x: string) => `plain:${x}`;
    const wrapped = t.tracedQuery(q);
    expect(wrapped).not.toBe(q);
    expect(wrapped('a')).toBe('traced:plain:a');
    expect(init).toHaveBeenCalledWith({ trackingUri: 'databricks', experimentId: '123' });
    expect(createTracedQuery).toHaveBeenCalledWith(q);
    wrapped('b');
    expect(createTracedQuery).toHaveBeenCalledTimes(1);
  });

  it('runs the plain query until MLflow has loaded', async () => {
    vi.doMock('@mlflow/core', () => ({ init: vi.fn() }));
    vi.doMock('@mlflow/claude-code', () => ({ createTracedQuery: (q: (x: string) => string) => (x: string) => `traced:${q(x)}` }));
    const t = await fresh();
    t.resetTracing();
    t.warmTracing(ENV); // not awaited
    const wrapped = t.tracedQuery((x: string) => `plain:${x}`);
    expect(wrapped('early')).toBe('plain:early');
    await t.warmTracing();
    expect(wrapped('late')).toBe('traced:plain:late');
  });

  it('falls back to the plain query when the import fails', async () => {
    vi.doMock('@mlflow/core', () => {
      throw new Error('cannot load');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await fresh();
    await t.warmTracing(ENV);
    const wrapped = t.tracedQuery((x: string) => `plain:${x}`);
    expect(wrapped('a')).toBe('plain:a');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back when init throws', async () => {
    vi.doMock('@mlflow/core', () => ({
      init: () => {
        throw new Error('bad config');
      },
    }));
    vi.doMock('@mlflow/claude-code', () => ({ createTracedQuery: (q: unknown) => q }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await fresh();
    await t.warmTracing(ENV);
    expect(t.tracedQuery((x: string) => `plain:${x}`)('a')).toBe('plain:a');
    warn.mockRestore();
  });
});
