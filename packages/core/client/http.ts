import { randomUUID } from "node:crypto";

import {
  clearSession,
  loadSession,
  saveSession,
  type SessionState,
  type StoredUser,
} from "../cli/state.js";

export type HttpClientOptions = {
  host: string;
  orgId?: string;
  token?: string;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

function isSafeMethod(method: string): boolean {
  return ["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase());
}

function splitSetCookieHeader(raw: string): string[] {
  const out: string[] = [];
  let part = "";
  let inExpires = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const lookahead = raw.slice(i).toLowerCase();

    if (!inExpires && lookahead.startsWith("expires=")) {
      inExpires = true;
    }

    if (ch === ";" && inExpires) {
      inExpires = false;
    }

    if (ch === "," && !inExpires) {
      out.push(part.trim());
      part = "";
      continue;
    }

    part += ch;
  }

  if (part.trim()) {
    out.push(part.trim());
  }

  return out;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const anyHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const combined = headers.get("set-cookie");
  if (!combined) {
    return [];
  }
  return splitSetCookieHeader(combined);
}

function parseSetCookie(setCookie: string): { name: string; value: string } | null {
  const first = setCookie.split(";", 1)[0];
  const eq = first.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) {
    return null;
  }
  return { name, value };
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

type RequestJsonOptions = {
  orgId?: string;
  retryOnAuth?: boolean;
};

export class CopilotHttpClient {
  private host: string;
  private orgId?: string;
  private delegatedToken?: string;
  private session: SessionState;

  private constructor(options: HttpClientOptions, session: SessionState) {
    this.host = normalizeHost(options.host);
    this.orgId = options.orgId;
    this.delegatedToken = options.token;
    this.session = session;
  }

  static async create(options: HttpClientOptions): Promise<CopilotHttpClient> {
    const host = normalizeHost(options.host);
    const session = await loadSession(host);
    return new CopilotHttpClient({ ...options, host }, session);
  }

  getSession(): SessionState {
    return this.session;
  }

  async clearSession(): Promise<void> {
    this.session = await clearSession(this.host);
  }

  private async persistSession(): Promise<void> {
    await saveSession(this.session);
  }

  private updateCookiesFromResponse(headers: Headers): void {
    const setCookies = getSetCookieHeaders(headers);
    for (const setCookie of setCookies) {
      const parsed = parseSetCookie(setCookie);
      if (!parsed) {
        continue;
      }
      this.session.cookies[parsed.name] = parsed.value;
      if (parsed.name.toLowerCase().includes("csrf")) {
        this.session.csrfToken = parsed.value;
      }
    }
  }

  private endpoint(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${this.host}${normalized}`;
  }

  private async sendRaw(
    path: string,
    init: RequestInit,
    options: RequestJsonOptions,
  ): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? {});

    headers.set("X-Request-ID", randomUUID());
    headers.set("Accept", "application/json");

    if (this.delegatedToken) {
      headers.set("Authorization", `Bearer ${this.delegatedToken}`);
    }

    if (options.orgId ?? this.orgId) {
      headers.set("X-Org-Id", options.orgId ?? this.orgId ?? "");
    }

    const cookieHeader = buildCookieHeader(this.session.cookies);
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }

    if (!isSafeMethod(method) && this.session.csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", this.session.csrfToken);
    }

    const response = await fetch(this.endpoint(path), {
      ...init,
      method,
      headers,
    });

    this.updateCookiesFromResponse(response.headers);
    await this.persistSession();

    return response;
  }

  private async parseError(response: Response): Promise<never> {
    let details: unknown;
    let message = `Request failed (${response.status})`;
    try {
      details = await response.json();
      if (details && typeof details === "object" && "detail" in details) {
        const detail = (details as { detail?: unknown }).detail;
        if (typeof detail === "string") {
          message = detail;
        }
      }
    } catch {
      try {
        const text = await response.text();
        if (text.trim()) {
          message = text.trim();
        }
      } catch {
        // ignore
      }
    }

    throw new ApiError(response.status, message, details);
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.delegatedToken) {
      return false;
    }

    try {
      const refreshResponse = await this.sendRaw(
        "/auth/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
        { retryOnAuth: false },
      );
      if (!refreshResponse.ok) {
        return false;
      }

      // Refresh CSRF token for state-changing requests.
      const csrfResp = await this.sendRaw(
        "/auth/csrf",
        {
          method: "GET",
        },
        { retryOnAuth: false },
      );
      if (csrfResp.ok) {
        try {
          const payload = (await csrfResp.json()) as { csrf_token?: string };
          if (payload.csrf_token) {
            this.session.csrfToken = payload.csrf_token;
            await this.persistSession();
          }
        } catch {
          // ignore parse issues
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  async requestJson<T>(
    path: string,
    init: RequestInit = {},
    options: RequestJsonOptions = {},
  ): Promise<T> {
    const retryOnAuth = options.retryOnAuth ?? true;

    let response = await this.sendRaw(path, init, options);
    if (response.status === 401 && retryOnAuth) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        response = await this.sendRaw(path, init, {
          ...options,
          retryOnAuth: false,
        });
      }
    }

    if (!response.ok) {
      await this.parseError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return text as T;
    }

    return (await response.json()) as T;
  }

  async register(email: string, password: string, username?: string): Promise<StoredUser> {
    const payload = await this.requestJson<StoredUser>(
      "/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          username: username ?? email.split("@")[0],
        }),
      },
      { retryOnAuth: false },
    );

    this.session.user = payload;
    await this.refreshCsrfToken();
    await this.persistSession();
    return payload;
  }

  async login(email: string, password: string): Promise<StoredUser> {
    const payload = await this.requestJson<StoredUser>(
      "/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
      { retryOnAuth: false },
    );

    this.session.user = payload;
    await this.refreshCsrfToken();
    await this.persistSession();
    return payload;
  }

  async refreshCsrfToken(): Promise<string | null> {
    const payload = await this.requestJson<{ csrf_token?: string }>(
      "/auth/csrf",
      {
        method: "GET",
      },
      { retryOnAuth: false },
    );

    this.session.csrfToken = payload.csrf_token ?? null;
    await this.persistSession();
    return this.session.csrfToken;
  }

  async me(): Promise<StoredUser> {
    const user = await this.requestJson<StoredUser>("/auth/me", { method: "GET" });
    this.session.user = user;
    await this.persistSession();
    return user;
  }

  async logout(): Promise<void> {
    await this.requestJson<{ ok: boolean }>(
      "/auth/logout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      { retryOnAuth: false },
    );

    await this.clearSession();
  }
}
