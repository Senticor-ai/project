export type ApiErrorShape = {
  message: string;
  status: number;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.status = shape.status;
    this.details = shape.details;
  }
}

export type ApiResponse<T> = {
  data: T;
  headers: Headers;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** Construct an absolute URL for a backend file path (e.g. `/files/{id}`). */
export function getFileUrl(relativePath: string): string {
  return `${API_BASE_URL}${relativePath}`;
}

const REQUEST_ID_HEADER = "X-Request-ID";
const USER_ID_HEADER = "X-User-ID";
const CSRF_HEADER = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let currentUserId: string | null = null;
let csrfToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshPromise: Promise<SessionRefreshResponse> | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export function setUserContext(user: AuthUser | null) {
  currentUserId = user?.id ?? null;
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export async function refreshCsrfToken() {
  const response = await request<{ csrf_token: string }>("/auth/csrf");
  setCsrfToken(response.csrf_token);
  return response.csrf_token;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function requestWithResponse<T>(
  path: string,
  init?: RequestInit,
  _isRetry = false,
): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers ?? {});
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = typeof init?.body !== "undefined";
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, createRequestId());
  }
  if (currentUserId && !headers.has(USER_ID_HEADER)) {
    headers.set(USER_ID_HEADER, currentUserId);
  }
  if (csrfToken && !SAFE_METHODS.has(method) && !headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-cache",
      headers,
    });
  } catch {
    throw new ApiError({
      message: "Server is not reachable. Please try again later.",
      status: 0,
    });
  }

  if (!response.ok) {
    // Attempt session refresh on 401 (once, and not for /auth/* paths)
    if (response.status === 401 && !_isRetry && !path.startsWith("/auth/")) {
      try {
        if (!refreshPromise) {
          refreshPromise = AuthApi.refresh();
        }
        await refreshPromise;
        return requestWithResponse<T>(path, init, true);
      } catch {
        onSessionExpired?.();
        throw new ApiError({
          message: "Session expired",
          status: 401,
        });
      } finally {
        refreshPromise = null;
      }
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : Number.NaN;
      throw new ApiError({
        message: "Too many requests. Please wait a moment and try again.",
        status: 429,
        details: {
          retryAfter: Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : 30,
        },
      });
    }

    const details = await parseJson(response);
    throw new ApiError({
      message: details?.detail ?? "Request failed",
      status: response.status,
      details,
    });
  }

  return {
    data: (await parseJson(response)) as T,
    headers: response.headers,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await requestWithResponse<T>(path, init);
  return data;
}

export type AuthUser = {
  id: string;
  email: string;
  username?: string | null;
  created_at: string;
};

export type SessionRefreshResponse = {
  user: AuthUser;
  expires_at: string;
  refresh_expires_at: string;
};

export const AuthApi = {
  register: async (email: string, password: string) => {
    const username = email.split("@")[0];
    const user = await request<AuthUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
    setUserContext(user);
    return user;
  },
  login: async (email: string, password: string) => {
    const user = await request<AuthUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUserContext(user);
    await refreshCsrfToken();
    return user;
  },
  logout: async () => {
    const result = await request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
    });
    setUserContext(null);
    setCsrfToken(null);
    return result;
  },
  me: async (signal?: AbortSignal) => {
    const user = await request<AuthUser>("/auth/me", { signal });
    setUserContext(user);
    return user;
  },
  refresh: async () => {
    const session = await request<SessionRefreshResponse>("/auth/refresh", {
      method: "POST",
    });
    setUserContext(session.user);
    await refreshCsrfToken();
    return session;
  },
};

// ---------------------------------------------------------------------------
// Organizations API
// ---------------------------------------------------------------------------

export type OrgResponse = {
  id: string;
  name: string;
  role: string;
  created_at: string;
};

export const OrgsApi = {
  list: () => request<OrgResponse[]>("/orgs"),

  create: (name: string) =>
    request<OrgResponse>("/orgs", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
};

export type ItemRecord = {
  item_id: string;
  canonical_id: string;
  source: string;
  item: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ArchiveResponse = {
  item_id: string;
  archived_at: string;
  ok: boolean;
};

// ---------------------------------------------------------------------------
// Files API (chunked upload)
// ---------------------------------------------------------------------------

export type FileInitiateResponse = {
  upload_id: string;
  upload_url: string;
  chunk_size: number;
  chunk_total: number;
  expires_at: string;
};

export type FileRecord = {
  file_id: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
  download_url: string;
};

export const FilesApi = {
  initiate: (filename: string, contentType: string, totalSize: number) =>
    request<FileInitiateResponse>("/files/initiate", {
      method: "POST",
      body: JSON.stringify({
        filename,
        content_type: contentType,
        total_size: totalSize,
      }),
    }),

  uploadChunk: (uploadId: string, chunk: Blob, index: number, total: number) =>
    request<{ received: number }>(`/files/upload/${uploadId}`, {
      method: "PUT",
      body: chunk,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Chunk-Index": String(index),
        "X-Chunk-Total": String(total),
      },
    }),

  complete: (uploadId: string) =>
    request<FileRecord>("/files/complete", {
      method: "POST",
      body: JSON.stringify({ upload_id: uploadId }),
    }),
};

// ---------------------------------------------------------------------------
// Imports API
// ---------------------------------------------------------------------------

export type NirvanaInspectRequest = {
  file_id: string;
  source?: string;
  update_existing?: boolean;
  include_completed?: boolean;
  state_bucket_map?: Record<string, string>;
  default_bucket?: string;
};

export type NirvanaImportFromFileRequest = {
  file_id: string;
  source?: string;
  update_existing?: boolean;
  include_completed?: boolean;
  emit_events?: boolean;
  state_bucket_map?: Record<string, string>;
  default_bucket?: string;
};

export type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  unchanged?: number;
  skipped: number;
  errors: number;
  bucket_counts: Record<string, number>;
  completed_counts?: Record<string, number>;
  sample_errors: string[];
};

export type ImportJobResponse = {
  job_id: string;
  status: string;
  file_id: string;
  file_sha256: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  summary: ImportSummary | null;
  progress: {
    processed: number;
    total: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  } | null;
  error: string | null;
  archived_at: string | null;
};

export type NativeInspectRequest = {
  file_id: string;
  source?: string;
  update_existing?: boolean;
  include_completed?: boolean;
};

export type NativeImportFromFileRequest = {
  file_id: string;
  source?: string;
  update_existing?: boolean;
  include_completed?: boolean;
  emit_events?: boolean;
};

export const ImportsApi = {
  inspectNirvana: (req: NirvanaInspectRequest) =>
    request<ImportSummary>("/imports/nirvana/inspect", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  importNirvanaFromFile: (req: NirvanaImportFromFileRequest) =>
    request<ImportJobResponse>("/imports/nirvana/from-file", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  inspectNative: (req: NativeInspectRequest) =>
    request<ImportSummary>("/imports/native/inspect", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  importNativeFromFile: (req: NativeImportFromFileRequest) =>
    request<ImportJobResponse>("/imports/native/from-file", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  getJob: (jobId: string) =>
    request<ImportJobResponse>(`/imports/jobs/${jobId}`),

  listJobs: (params?: { status?: string[]; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) {
      for (const s of params.status) searchParams.append("status", s);
    }
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return request<ImportJobResponse[]>(`/imports/jobs${qs ? `?${qs}` : ""}`);
  },

  retryJob: (jobId: string) =>
    request<ImportJobResponse>(`/imports/jobs/${jobId}/retry`, {
      method: "POST",
    }),

  archiveJob: (jobId: string) =>
    request<ImportJobResponse>(`/imports/jobs/${jobId}/archive`, {
      method: "POST",
    }),
};

// ---------------------------------------------------------------------------
// Email API
// ---------------------------------------------------------------------------

export type EmailConnectionResponse = {
  connection_id: string;
  email_address: string;
  display_name: string | null;
  auth_method: "oauth2";
  oauth_provider: "gmail";
  sync_interval_minutes: number;
  sync_mark_read: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_message_count: number | null;
  is_active: boolean;
  watch_active: boolean;
  watch_expires_at: string | null;
  created_at: string;
};

export type EmailSyncResponse = {
  synced: number;
  created: number;
  skipped: number;
  errors: number;
};

export type EmailConnectionUpdateRequest = {
  sync_interval_minutes?: number;
  sync_mark_read?: boolean;
};

export const EmailApi = {
  getGmailAuthUrl: (returnUrl?: string) => {
    const qs = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
    return request<{ url: string }>(`/email/oauth/gmail/authorize${qs}`);
  },

  listConnections: () =>
    request<EmailConnectionResponse[]>("/email/connections"),

  getConnection: (id: string) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`),

  updateConnection: (id: string, patch: EmailConnectionUpdateRequest) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  triggerSync: (id: string) =>
    request<EmailSyncResponse>(`/email/connections/${id}/sync`, {
      method: "POST",
    }),

  disconnect: (id: string) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`, {
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------------------
// Dev API
// ---------------------------------------------------------------------------

export type FlushResponse = {
  ok: boolean;
  deleted: Record<string, number>;
};

export const DevApi = {
  flush: () => request<FlushResponse>("/dev/flush", { method: "POST" }),
};

// ---------------------------------------------------------------------------
// Items API
// ---------------------------------------------------------------------------

export type SyncResponse = {
  items: ItemRecord[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;
};

export function downloadExport(options: {
  includeArchived: boolean;
  includeCompleted: boolean;
}) {
  const params = new URLSearchParams();
  if (options.includeArchived) params.set("include_archived", "true");
  if (options.includeCompleted) params.set("include_completed", "true");
  const qs = params.toString();
  const url = `${API_BASE_URL}/items/export${qs ? `?${qs}` : ""}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Chat API (Copilot Copilot)
// ---------------------------------------------------------------------------

export type ExecuteToolRequest = {
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  };
  conversationId: string;
};

export type ExecuteToolResponse = {
  createdItems: Array<{
    canonicalId: string;
    name: string;
    type: "project" | "action" | "reference";
  }>;
};

export const ChatApi = {
  executeTool: (req: ExecuteToolRequest) =>
    request<ExecuteToolResponse>("/chat/execute-tool", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

// ---------------------------------------------------------------------------
// Agent Settings API
// ---------------------------------------------------------------------------

export type AgentSettingsResponse = {
  agentBackend: "haystack" | "openclaw";
  provider: "openrouter" | "openai" | "anthropic";
  hasApiKey: boolean;
  model: string;
  containerStatus: string | null;
  containerError: string | null;
};

export type AgentContainerStatusResponse = {
  status: string | null;
  url: string | null;
  error: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  port: number | null;
};

export type AgentSettingsUpdateRequest = {
  agentBackend?: "haystack" | "openclaw";
  provider?: "openrouter" | "openai" | "anthropic";
  apiKey?: string;
  model?: string;
};

export const AgentApi = {
  getSettings: () => request<AgentSettingsResponse>("/agent/settings"),

  updateSettings: (data: AgentSettingsUpdateRequest) =>
    request<AgentSettingsResponse>("/agent/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteApiKey: () =>
    request<{ ok: boolean }>("/agent/settings/api-key", {
      method: "DELETE",
    }),

  getContainerStatus: () =>
    request<AgentContainerStatusResponse>("/agent/status"),

  stopContainer: () =>
    request<{ ok: boolean }>("/agent/container/stop", { method: "POST" }),

  restartContainer: () =>
    request<{ ok: boolean; url: string }>("/agent/container/restart", {
      method: "POST",
    }),
};

// ---------------------------------------------------------------------------
// Items API
// ---------------------------------------------------------------------------

export const ItemsApi = {
  list: (limit = 50, offset = 0) =>
    request<ItemRecord[]>(`/items?limit=${limit}&offset=${offset}`),

  sync: (params?: {
    limit?: number;
    cursor?: string;
    since?: string;
    completed?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.cursor) sp.set("cursor", params.cursor);
    if (params?.since) sp.set("since", params.since);
    if (params?.completed) sp.set("completed", params.completed);
    const qs = sp.toString();
    return request<SyncResponse>(`/items/sync${qs ? `?${qs}` : ""}`);
  },

  get: (itemId: string) => request<ItemRecord>(`/items/${itemId}`),

  create: (item: Record<string, unknown>, source = "manual") =>
    request<ItemRecord>("/items", {
      method: "POST",
      body: JSON.stringify({ item, source }),
    }),

  update: (
    itemId: string,
    item: Record<string, unknown>,
    source?: string,
    idempotencyKey?: string,
    nameSource?: string,
    etag?: string | null,
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (etag) headers["If-Match"] = etag;
    return requestWithResponse<ItemRecord>(`/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        item,
        ...(source && { source }),
        ...(nameSource && { name_source: nameSource }),
      }),
      headers,
    });
  },

  archive: (itemId: string) =>
    request<ArchiveResponse>(`/items/${itemId}`, {
      method: "DELETE",
    }),
};
