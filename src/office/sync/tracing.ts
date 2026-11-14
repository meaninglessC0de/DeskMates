/**
 * MLflow tracing for the Agent SDK `query`. One trace per employee session (one `query` call), completed when the session ends.
 * `createTracedQuery` does not initialise MLflow itself, so `init` from @mlflow/core is called here, once, before the first wrap.
 * Both packages are ESM only and are imported dynamically; any failure leaves the untouched `query` in place.
 */
type Env = Record<string, string | undefined>;
type AnyFn = (...args: never[]) => unknown;
type Wrap = (q: AnyFn) => AnyFn;

let envOverride: Env | null = null;
let loading: Promise<Wrap | null> | null = null;
let loaded: Wrap | null = null;
let loadedFor = '';

const get = (): Env => envOverride ?? process.env;

export function tracingConfigured(env: Env = get()): boolean {
  return !!(env.MLFLOW_EXPERIMENT_ID && env.DATABRICKS_HOST && env.DATABRICKS_TOKEN);
}

/** Link to the experiment page in Databricks, or null when tracing is not configured. */
export function experimentUrl(env: Env = get()): string | null {
  if (!tracingConfigured(env)) return null;
  return `${env.DATABRICKS_HOST!.replace(/\/+$/, '')}/ml/experiments/${encodeURIComponent(env.MLFLOW_EXPERIMENT_ID!)}`;
}

async function load(env: Env): Promise<Wrap | null> {
  try {
    const core = await import('@mlflow/core');
    const cc = await import('@mlflow/claude-code');
    core.init({ trackingUri: env.MLFLOW_TRACKING_URI || 'databricks', experimentId: env.MLFLOW_EXPERIMENT_ID! });
    loaded = cc.createTracedQuery as unknown as Wrap;
    return loaded;
  } catch (e) {
    console.warn('[tracing] MLflow tracing unavailable, running untraced:', (e as Error).message);
    return null;
  }
}

/** Starts loading the tracing modules (a no-op when unconfigured). The office awaits it at start-up so the first session is traced. */
export function warmTracing(env?: Env): Promise<void> {
  if (env) envOverride = env;
  const cfg = get();
  if (!tracingConfigured(cfg)) return Promise.resolve();
  const sig = `${cfg.MLFLOW_TRACKING_URI}|${cfg.MLFLOW_EXPERIMENT_ID}|${cfg.DATABRICKS_HOST}`;
  if (!loading || loadedFor !== sig) {
    loadedFor = sig;
    loaded = null;
    loading = load(cfg);
  }
  return loading.then(() => undefined);
}

/** For tests. */
export function resetTracing(): void {
  envOverride = null;
  loading = null;
  loaded = null;
  loadedFor = '';
}

/**
 * The SDK `query` unchanged when tracing is not configured. When it is, a function that calls the traced query once MLflow has loaded
 * and the plain query until then (or for good if loading failed). It never throws because of tracing.
 */
export function tracedQuery<Q>(q: Q): Q {
  if (typeof q !== 'function' || !tracingConfigured()) return q;
  const plain = q as unknown as AnyFn;
  let traced: AnyFn | null = null;
  let wrappedBy: Wrap | null = null;
  void warmTracing();
  const pick = (): AnyFn => {
    if (loaded && wrappedBy !== loaded) {
      try {
        traced = loaded(plain);
        wrappedBy = loaded;
      } catch (e) {
        console.warn('[tracing] could not wrap query, running untraced:', (e as Error).message);
        loaded = null;
      }
    }
    return traced ?? plain;
  };
  return ((...args: never[]) => pick()(...args)) as unknown as Q;
}
