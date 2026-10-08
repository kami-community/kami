/** Minimal HTTP client for the Kami founder-path API. */

import { Agent, fetch as undiciFetch } from "undici";

/** Discover/dossier can exceed undici's default 300s headersTimeout. */
const longAgent = new Agent({
  headersTimeout: 900_000,
  bodyTimeout: 900_000,
  connectTimeout: 60_000,
});

const SLOW_PATH =
  /\/api\/(sessions|sales\/discover|marketing\/distribution|sales\/segments|sales\/plan)/;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(public readonly baseUrl: string) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ data: T; status: number; ms: number }> {
    const started = Date.now();
    const init: Parameters<typeof undiciFetch>[1] = {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    };
    if (SLOW_PATH.test(path)) {
      init.dispatcher = longAgent;
    }
    const res = await undiciFetch(`${this.baseUrl}${path}`, init);
    const ms = Date.now() - started;
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      if (data && typeof data === "object") {
        const o = data as { error?: unknown; reason?: unknown; detail?: unknown };
        if (typeof o.error === "string" && o.error.trim()) errMsg = o.error;
        else if (typeof o.reason === "string" && o.reason.trim()) {
          errMsg = o.detail ? `${o.reason} (${o.detail})` : o.reason;
        }
      }
      throw new ApiError(errMsg, res.status, data);
    }
    return { data: data as T, status: res.status, ms };
  }

  get<T = unknown>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }
}
