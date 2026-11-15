export interface Env {
  // required for real employees
  ANTHROPIC_API_KEY: string;
  EMPLOYEE_MODEL: string;
  VOICE_MODEL: string;
  // desktops
  DESKTOPS: 'cua' | 'mock';
  CUA_TELEMETRY: string;
  DO_NOT_TRACK: string;
  // calls
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  SYNTHESIA_API_KEY: string;
  DEEPGRAM_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  // Databricks
  DATABRICKS_SYNC: 'on' | 'off';
  DATABRICKS_HOST: string;
  DATABRICKS_TOKEN: string;
  DATABRICKS_WAREHOUSE_ID: string;
  DATABRICKS_CATALOG: string;
  DATABRICKS_SCHEMA: string;
  DATABRICKS_GENIE_SPACE_ID: string;
  MLFLOW_TRACKING_URI: string;
  MLFLOW_EXPERIMENT_ID: string;
  EMPLOYEE_TASK_BUDGET_USD: number;
  MAX_TEAM: number;
  CALL_HANDS: boolean;
  USER_NAME: string;
  // testing and development
  MOCK_LLM: boolean;
  MOCK_GENIE: boolean;
  OFFICE_PORT: number;
  WEB_PORT: number;
  DATA_DIR: string;
  VITE_OFFICE_URL: string;
  AGENT_MANAGER_TEST: boolean;
}

export type EnvSource = Record<string, string | undefined>;

function str(src: EnvSource, key: string, fallback: string): string {
  const v = src[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(src: EnvSource, key: string, fallback: number): number {
  const v = src[key];
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(src: EnvSource, key: string, fallback: boolean): boolean {
  const v = src[key];
  if (v === undefined || v.trim() === '') return fallback;
  return ['1', 'true', 'on', 'yes'].includes(v.trim().toLowerCase());
}

function oneOf<T extends string>(src: EnvSource, key: string, allowed: readonly T[], fallback: T): T {
  const v = src[key]?.trim().toLowerCase();
  return allowed.find((a) => a === v) ?? fallback;
}

/** Reads the contracts section 8 variables with their defaults. Imports nothing from Node: safe in the renderer. */
export function readEnv(source?: EnvSource): Env {
  const src: EnvSource =
    source ?? (globalThis as { process?: { env?: EnvSource } }).process?.env ?? {};
  return {
    ANTHROPIC_API_KEY: str(src, 'ANTHROPIC_API_KEY', ''),
    EMPLOYEE_MODEL: str(src, 'EMPLOYEE_MODEL', 'claude-sonnet-5-5'),
    VOICE_MODEL: str(src, 'VOICE_MODEL', 'claude-haiku-5-5'),
    DESKTOPS: oneOf(src, 'DESKTOPS', ['cua', 'mock'] as const, 'cua'),
    CUA_TELEMETRY: str(src, 'CUA_TELEMETRY', '0'),
    DO_NOT_TRACK: str(src, 'DO_NOT_TRACK', '1'),
    LIVEKIT_URL: str(src, 'LIVEKIT_URL', ''),
    LIVEKIT_API_KEY: str(src, 'LIVEKIT_API_KEY', ''),
    LIVEKIT_API_SECRET: str(src, 'LIVEKIT_API_SECRET', ''),
    SYNTHESIA_API_KEY: str(src, 'SYNTHESIA_API_KEY', ''),
    DEEPGRAM_API_KEY: str(src, 'DEEPGRAM_API_KEY', ''),
    ELEVENLABS_API_KEY: str(src, 'ELEVENLABS_API_KEY', ''),
    DATABRICKS_SYNC: oneOf(src, 'DATABRICKS_SYNC', ['on', 'off'] as const, 'off'),
    DATABRICKS_HOST: str(src, 'DATABRICKS_HOST', ''),
    DATABRICKS_TOKEN: str(src, 'DATABRICKS_TOKEN', ''),
    DATABRICKS_WAREHOUSE_ID: str(src, 'DATABRICKS_WAREHOUSE_ID', ''),
    DATABRICKS_CATALOG: str(src, 'DATABRICKS_CATALOG', 'workspace'),
    DATABRICKS_SCHEMA: str(src, 'DATABRICKS_SCHEMA', 'deskmates'),
    DATABRICKS_GENIE_SPACE_ID: str(src, 'DATABRICKS_GENIE_SPACE_ID', ''),
    MLFLOW_TRACKING_URI: str(src, 'MLFLOW_TRACKING_URI', 'databricks'),
    MLFLOW_EXPERIMENT_ID: str(src, 'MLFLOW_EXPERIMENT_ID', ''),
    EMPLOYEE_TASK_BUDGET_USD: num(src, 'EMPLOYEE_TASK_BUDGET_USD', 5),
    MAX_TEAM: num(src, 'MAX_TEAM', 4),
    CALL_HANDS: bool(src, 'CALL_HANDS', false),
    USER_NAME: str(src, 'USER_NAME', ''),
    MOCK_LLM: bool(src, 'MOCK_LLM', false),
    MOCK_GENIE: bool(src, 'MOCK_GENIE', false),
    OFFICE_PORT: num(src, 'OFFICE_PORT', 4317),
    WEB_PORT: num(src, 'WEB_PORT', 4318),
    DATA_DIR: str(src, 'DATA_DIR', 'data'),
    VITE_OFFICE_URL: str(src, 'VITE_OFFICE_URL', 'http://127.0.0.1:4317'),
    AGENT_MANAGER_TEST: bool(src, 'AGENT_MANAGER_TEST', false),
  };
}
