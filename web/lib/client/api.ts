/**
 * Browser-side JSON client for Kami's API routes. Non-2xx responses throw an
 * `ApiError` carrying the server's message and code, so callers never parse
 * error bodies by hand.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.body = body;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: "Network error — is the Kami server running?" });
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** Build a URL with query params, skipping null/undefined values. */
export function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== null && v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error ? err.message : fallback;
}
