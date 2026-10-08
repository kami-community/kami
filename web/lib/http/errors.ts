/**
 * Typed application errors. Services throw these; `route()` turns them into
 * `{ error, code }` JSON responses with the matching status.
 */

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "paused"
  | "rate_limited"
  | "not_configured"
  | "upstream_failed"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  paused: 423,
  rate_limited: 429,
  not_configured: 503,
  upstream_failed: 502,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError("bad_request", message, details);
export const forbidden = (message: string, details?: Record<string, unknown>) =>
  new AppError("forbidden", message, details);
export const notFound = (message: string) => new AppError("not_found", message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError("conflict", message, details);
export const paused = (message: string) => new AppError("paused", message);
export const notConfigured = (message: string) => new AppError("not_configured", message);
export const upstreamFailed = (message: string, details?: Record<string, unknown>) =>
  new AppError("upstream_failed", message, details);
