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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const REQUEST_ID_HEADER = "X-Request-ID";
const USER_ID_HEADER = "X-User-ID";
const CSRF_HEADER = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

let currentUserId: string | null = null;
let csrfToken: string | null = null;

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-cache",
    headers,
  });

  if (!response.ok) {
    const details = await parseJson(response);
    throw new ApiError({
      message: details?.detail ?? "Request failed",
      status: response.status,
      details,
    });
  }

  return (await parseJson(response)) as T;
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

export type ThingRecord = {
  thing_id: string;
  canonical_id: string;
  source: string;
  thing: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ArchiveResponse = {
  thing_id: string;
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

export type NirvanaImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  bucket_counts: Record<string, number>;
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
  summary: NirvanaImportSummary | null;
  error: string | null;
};

export const ImportsApi = {
  inspectNirvana: (req: NirvanaInspectRequest) =>
    request<NirvanaImportSummary>("/imports/nirvana/inspect", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  importNirvanaFromFile: (req: NirvanaImportFromFileRequest) =>
    request<ImportJobResponse>("/imports/nirvana/from-file", {
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
};

// ---------------------------------------------------------------------------
// Things API
// ---------------------------------------------------------------------------

export type SyncResponse = {
  items: ThingRecord[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;
};

export function downloadExport(format: "json" | "csv") {
  const url = `${API_BASE_URL}/things/export?format=${format}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const ThingsApi = {
  list: (limit = 50, offset = 0) =>
    request<ThingRecord[]>(`/things?limit=${limit}&offset=${offset}`),

  sync: (params?: { limit?: number; cursor?: string; since?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.cursor) sp.set("cursor", params.cursor);
    if (params?.since) sp.set("since", params.since);
    const qs = sp.toString();
    return request<SyncResponse>(`/things/sync${qs ? `?${qs}` : ""}`);
  },

  get: (thingId: string) => request<ThingRecord>(`/things/${thingId}`),

  create: (thing: Record<string, unknown>, source = "manual") =>
    request<ThingRecord>("/things", {
      method: "POST",
      body: JSON.stringify({ thing, source }),
    }),

  update: (
    thingId: string,
    thing: Record<string, unknown>,
    source?: string,
    idempotencyKey?: string,
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<ThingRecord>(`/things/${thingId}`, {
      method: "PATCH",
      body: JSON.stringify({ thing, ...(source && { source }) }),
      headers,
    });
  },

  archive: (thingId: string) =>
    request<ArchiveResponse>(`/things/${thingId}`, {
      method: "DELETE",
    }),
};
