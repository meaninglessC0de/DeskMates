export class DatabricksError extends Error {
  constructor(message: string, public kind: 'auth' | 'timeout' | 'http' | 'failed' | 'network', public statusCode?: number) {
    super(message);
  }
}

export interface ApiConfig {
  host: string;
  token: string;
  /** Per HTTP request. */
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
}

/** Host as given in DATABRICKS_HOST: no trailing slash, https only (plain http is allowed for localhost, where the fake runs in tests). */
export function normaliseHost(host: string): string {
  const url = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !local) throw new Error('DATABRICKS_HOST must be an https URL.');
  return url.origin;
}

/** One JSON request with a timeout. The token only ever goes into the Authorization header and is never part of an error message. */
export async function api<T>(cfg: ApiConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const f = cfg.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(normaliseHost(cfg.host) + path, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs ?? 8000),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new DatabricksError('The request timed out.', 'timeout');
    throw new DatabricksError('Could not reach Databricks.', 'network');
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let message = '';
    try {
      const j = JSON.parse(text) as { message?: string; error_code?: string };
      message = [j.error_code, j.message].filter(Boolean).join(': ');
    } catch {
      /* not JSON */
    }
    const kind = res.status === 401 || res.status === 403 ? 'auth' : 'http';
    throw new DatabricksError(message || `Databricks answered ${res.status}.`, kind, res.status);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new DatabricksError('Databricks sent an answer that is not JSON.', 'http', res.status);
  }
}
