export const SCHEMA_VERSION = "copilot.v1";

export type ExitCode = 0 | 2 | 3 | 4 | 5 | 10 | 20;

export type ErrorEnvelope = {
  schema_version: typeof SCHEMA_VERSION;
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryable: boolean;
  };
};

export type SuccessEnvelope<T> = {
  schema_version: typeof SCHEMA_VERSION;
  ok: true;
  data: T;
  meta: {
    request_id?: string;
    duration_ms?: number;
  };
};

export function mapHttpStatusToExitCode(status: number): ExitCode {
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 5;
  if (status === 409) return 10;
  if (status === 422) return 4;
  if (status >= 500 || status === 0) return 20;
  return 2;
}

export function errorCodeFromStatus(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_FAILED";
  if (status >= 500) return "BACKEND_ERROR";
  return "REQUEST_FAILED";
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printSuccessJson<T>(data: T): void {
  const payload: SuccessEnvelope<T> = {
    schema_version: SCHEMA_VERSION,
    ok: true,
    data,
    meta: {},
  };
  printJson(payload);
}

export function printErrorJson(params: {
  status: number;
  message: string;
  details?: unknown;
  code?: string;
}): void {
  const payload: ErrorEnvelope = {
    schema_version: SCHEMA_VERSION,
    ok: false,
    error: {
      code: params.code ?? errorCodeFromStatus(params.status),
      message: params.message,
      details: params.details,
      retryable: params.status >= 500 || params.status === 0,
    },
  };
  printJson(payload);
}
