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
const TRAIL_ID_HEADER = "X-Trail-ID";
const USER_ID_HEADER = "X-User-ID";
const CSRF_HEADER = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const REQUEST_LOGS_ENABLED_RAW =
  import.meta.env.VITE_REQUEST_LOGS_ENABLED ??
  (import.meta.env.MODE === "test" ? "false" : "true");
const REQUEST_LOGS_ENABLED = REQUEST_LOGS_ENABLED_RAW.toLowerCase() !== "false";

type FrontendRequestLog = {
  request_id: string;
  user_id?: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  route: string;
  handler: string;
  error_reason?: string;
  retry: boolean;
  server_request_id?: string;
  server_trail_id?: string;
};

function nowMs() {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function currentRoutePath() {
  if (typeof window === "undefined") {
    return "unknown";
  }
  return window.location.pathname;
}

function logFrontendRequest(entry: FrontendRequestLog) {
  if (!REQUEST_LOGS_ENABLED) {
    return;
  }

  const payload = {
    layer: "frontend",
    ...entry,
  };
  if (entry.status >= 400) {
    console.warn("[frontend.request]", payload);
    return;
  }
  console.info("[frontend.request]", payload);
}

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

function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof (detail as { message?: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }
  return null;
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
  _requestId?: string,
): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers ?? {});
  const method = (init?.method ?? "GET").toUpperCase();
  const requestId =
    _requestId ?? headers.get(REQUEST_ID_HEADER) ?? createRequestId();
  headers.set(REQUEST_ID_HEADER, requestId);
  const startMs = nowMs();
  const uiRoute = currentRoutePath();

  const hasBody = typeof init?.body !== "undefined";
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
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
    logFrontendRequest({
      request_id: requestId,
      user_id: currentUserId ?? undefined,
      method,
      path,
      status: 0,
      duration_ms: intDurationMs(startMs),
      route: uiRoute,
      handler: "api-client.requestWithResponse",
      error_reason: "Server is not reachable",
      retry: _isRetry,
    });
    throw new ApiError({
      message: "Server is not reachable. Please try again later.",
      status: 0,
    });
  }

  if (!response.ok) {
    const details = await parseJson(response);
    const parsedMessage = detailMessage(details?.detail);
    const detailReason = parsedMessage ?? `HTTP ${response.status}`;
    logFrontendRequest({
      request_id: requestId,
      user_id: currentUserId ?? undefined,
      method,
      path,
      status: response.status,
      duration_ms: intDurationMs(startMs),
      route: uiRoute,
      handler: "api-client.requestWithResponse",
      error_reason: detailReason,
      retry: _isRetry,
      server_request_id: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
      server_trail_id: response.headers.get(TRAIL_ID_HEADER) ?? undefined,
    });

    // Attempt session refresh on 401 (once, and not for /auth/* paths)
    if (response.status === 401 && !_isRetry && !path.startsWith("/auth/")) {
      try {
        if (!refreshPromise) {
          refreshPromise = AuthApi.refresh();
        }
        await refreshPromise;
        return requestWithResponse<T>(
          path,
          {
            ...init,
            headers,
          },
          true,
          requestId,
        );
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

    const detail = details?.detail;
    throw new ApiError({
      message: detailMessage(detail) ?? "Request failed",
      status: response.status,
      details,
    });
  }

  logFrontendRequest({
    request_id: requestId,
    user_id: currentUserId ?? undefined,
    method,
    path,
    status: response.status,
    duration_ms: intDurationMs(startMs),
    route: uiRoute,
    handler: "api-client.requestWithResponse",
    retry: _isRetry,
    server_request_id: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
    server_trail_id: response.headers.get(TRAIL_ID_HEADER) ?? undefined,
  });

  return {
    data: (await parseJson(response)) as T,
    headers: response.headers,
  };
}

function intDurationMs(startMs: number): number {
  return Math.max(0, Math.round(nowMs() - startMs));
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
  disclaimer_acknowledged_at?: string | null;
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
  acknowledgeDisclaimer: async () => {
    const user = await request<AuthUser>("/auth/acknowledge-disclaimer", {
      method: "POST",
    });
    setUserContext(user);
    return user;
  },
};

// ---------------------------------------------------------------------------
// Organizations API
// ---------------------------------------------------------------------------

export type OrgDocIds = {
  general: string | null;
  user: string | null;
  log: string | null;
  agent: string | null;
};

export type OrgResponse = {
  id: string;
  name: string;
  role: string;
  created_at: string;
  doc_ids?: OrgDocIds;
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

export type ItemContentResponse = {
  item_id: string;
  canonical_id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  bucket: string | null;
  file_content: string | null;
  file_name: string | null;
};

// ---------------------------------------------------------------------------
// Collaboration API
// ---------------------------------------------------------------------------

export type WorkflowTransitionResponse = {
  from_status: string;
  to_status: string;
};

export type WorkflowDefinitionResponse = {
  policy_mode: string;
  default_status: string;
  done_statuses: string[];
  blocked_statuses: string[];
  canonical_statuses: string[];
  column_labels: Record<string, string>;
  transitions: WorkflowTransitionResponse[];
};

export type ProjectMemberResponse = {
  project_id: string;
  user_id: string;
  email: string;
  role: string;
  is_owner: boolean;
  added_at: string;
  added_by: string | null;
};

export type ProjectMemberDeleteResponse = {
  ok: boolean;
  project_id: string;
  user_id: string;
};

export type ProjectActionCommentResponse = {
  id: string;
  action_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ProjectActionRevisionResponse = {
  id: number;
  action_id: string;
  actor_id: string;
  diff: Record<string, unknown>;
  created_at: string;
};

export type ProjectActionTransitionEventResponse = {
  id: number;
  action_id: string;
  ts: string;
  actor_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  payload: Record<string, unknown>;
  correlation_id: string | null;
};

export type ProjectActionResponse = {
  id: string;
  canonical_id: string;
  project_id: string;
  name: string;
  description: string | null;
  action_status: string;
  owner_user_id: string | null;
  owner_text: string | null;
  due_at: string | null;
  tags: string[];
  object_ref: Record<string, unknown> | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_event_id: number | null;
  comment_count: number;
};

export type ProjectActionDetailResponse = ProjectActionResponse & {
  comments: ProjectActionCommentResponse[];
  revisions: ProjectActionRevisionResponse[];
};

export type ProjectActionHistoryResponse = {
  transitions: ProjectActionTransitionEventResponse[];
  revisions: ProjectActionRevisionResponse[];
};

export type ProjectActionListRequest = {
  status?: string[];
  tag?: string;
  owner_user_id?: string;
  due_before?: string;
  due_after?: string;
};

export type ProjectActionCreateRequest = {
  canonical_id?: string;
  name: string;
  description?: string;
  action_status?: string;
  owner_user_id?: string;
  owner_text?: string;
  due_at?: string;
  tags?: string[];
  object_ref?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  correlation_id?: string;
};

export type ProjectActionUpdateRequest = {
  name?: string;
  description?: string;
  owner_user_id?: string;
  owner_text?: string | null;
  due_at?: string | null;
  tags?: string[];
  object_ref?: Record<string, unknown> | null;
  attributes?: Record<string, unknown>;
};

export type ProjectActionTransitionRequest = {
  to_status: string;
  reason?: string;
  payload?: Record<string, unknown>;
  correlation_id?: string;
  expected_last_event_id?: number;
};

export type ProjectActionCommentRequest = {
  body: string;
  parent_comment_id?: string;
};

export const CollaborationApi = {
  getProjectWorkflow: (projectId: string) =>
    request<WorkflowDefinitionResponse>(
      `/projects/${encodeURIComponent(projectId)}/workflow`,
    ),

  listProjectMembers: (projectId: string) =>
    request<ProjectMemberResponse[]>(
      `/projects/${encodeURIComponent(projectId)}/members`,
    ),

  addProjectMember: (
    projectId: string,
    payload: { email: string; role?: string },
  ) =>
    request<ProjectMemberResponse>(
      `/projects/${encodeURIComponent(projectId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  removeProjectMember: (projectId: string, targetUserId: string) =>
    request<ProjectMemberDeleteResponse>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(targetUserId)}`,
      {
        method: "DELETE",
      },
    ),

  listProjectActions: (
    projectId: string,
    params?: ProjectActionListRequest,
  ) => {
    const searchParams = new URLSearchParams();
    for (const status of params?.status ?? []) {
      if (status) searchParams.append("status", status);
    }
    if (params?.tag) searchParams.set("tag", params.tag);
    if (params?.owner_user_id) {
      searchParams.set("owner_user_id", params.owner_user_id);
    }
    if (params?.due_before) searchParams.set("due_before", params.due_before);
    if (params?.due_after) searchParams.set("due_after", params.due_after);
    const qs = searchParams.toString();
    return request<ProjectActionResponse[]>(
      `/projects/${encodeURIComponent(projectId)}/actions${qs ? `?${qs}` : ""}`,
    );
  },

  getProjectAction: (projectId: string, actionId: string) =>
    request<ProjectActionDetailResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}`,
    ),

  getProjectActionHistory: (projectId: string, actionId: string) =>
    request<ProjectActionHistoryResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}/history`,
    ),

  createProjectAction: (
    projectId: string,
    payload: ProjectActionCreateRequest,
  ) =>
    request<ProjectActionResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  updateProjectAction: (
    projectId: string,
    actionId: string,
    payload: ProjectActionUpdateRequest,
  ) =>
    request<ProjectActionResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  transitionProjectAction: (
    projectId: string,
    actionId: string,
    payload: ProjectActionTransitionRequest,
  ) =>
    request<ProjectActionResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}/transition`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  addProjectActionComment: (
    projectId: string,
    actionId: string,
    payload: ProjectActionCommentRequest,
  ) =>
    request<ProjectActionCommentResponse>(
      `/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(actionId)}/comments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
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
  calendar_sync_enabled?: boolean;
  calendar_selected_ids?: string[];
  calendar_sync_token?: string | null;
  last_calendar_sync_at?: string | null;
  last_calendar_sync_error?: string | null;
  last_calendar_sync_event_count?: number | null;
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
  calendar_synced?: number;
  calendar_created?: number;
  calendar_updated?: number;
  calendar_archived?: number;
  calendar_errors?: number;
};

export type EmailProposalResponse = {
  proposal_id: string;
  proposal_type: string;
  why: string;
  confidence: string;
  requires_confirmation: boolean;
  suggested_actions: string[];
  status: string;
  created_at: string;
};

export type EmailProposalDecisionResponse = {
  proposal_id: string;
  status: string;
};

export type EmailConnectionCalendarResponse = {
  calendar_id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  access_role: string | null;
};

export type EmailConnectionUpdateRequest = {
  sync_interval_minutes?: number;
  sync_mark_read?: boolean;
  calendar_sync_enabled?: boolean;
  calendar_selected_ids?: string[];
};

export const EmailApi = {
  getGmailAuthUrl: (returnUrl?: string) => {
    const qs = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
    return request<{ url: string }>(`/email/oauth/gmail/authorize${qs}`);
  },

  getGmailAuthRedirectUrl: (returnUrl?: string) => {
    const params = new URLSearchParams();
    if (returnUrl) {
      params.set("return_url", returnUrl);
    }
    params.set("redirect", "true");
    return `${API_BASE_URL}/email/oauth/gmail/authorize?${params.toString()}`;
  },

  listConnections: () =>
    request<EmailConnectionResponse[]>("/email/connections"),

  getConnection: (id: string) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`),

  listConnectionCalendars: (id: string) =>
    request<EmailConnectionCalendarResponse[]>(
      `/email/connections/${id}/calendars`,
    ),

  updateConnection: (id: string, patch: EmailConnectionUpdateRequest) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  triggerSync: (id: string) =>
    request<EmailSyncResponse>(`/email/connections/${id}/sync`, {
      method: "POST",
    }),

  listProposals: () => request<EmailProposalResponse[]>("/email/proposals"),

  generateProposals: () =>
    request<EmailProposalResponse[]>("/email/proposals/generate", {
      method: "POST",
    }),

  confirmProposal: (proposalId: string) =>
    request<EmailProposalDecisionResponse>(
      `/email/proposals/${proposalId}/confirm`,
      {
        method: "POST",
      },
    ),

  dismissProposal: (proposalId: string) =>
    request<EmailProposalDecisionResponse>(
      `/email/proposals/${proposalId}/dismiss`,
      {
        method: "POST",
      },
    ),

  disconnect: (id: string) =>
    request<EmailConnectionResponse>(`/email/connections/${id}`, {
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------

export type NotificationEventResponse = {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at?: string | null;
};

export type NotificationSendRequest = {
  kind?: string;
  title: string;
  body: string;
  url?: string | null;
  payload?: Record<string, unknown>;
  target_user_id?: string;
};

export const NotificationsApi = {
  list: (params?: { cursor?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return request<NotificationEventResponse[]>(
      `/notifications${qs ? `?${qs}` : ""}`,
    );
  },

  send: (payload: NotificationSendRequest) =>
    request<NotificationEventResponse>("/notifications/send", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  streamUrl: (params?: { cursor?: string; pollSeconds?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.pollSeconds) {
      searchParams.set("poll_seconds", String(params.pollSeconds));
    }
    const qs = searchParams.toString();
    return `${API_BASE_URL}/notifications/stream${qs ? `?${qs}` : ""}`;
  },
};

// ---------------------------------------------------------------------------
// Calendar API
// ---------------------------------------------------------------------------

export type CalendarSyncState =
  | "Synced"
  | "Saving"
  | "Sync failed"
  | "Local only";

export type CalendarEventResponse = {
  item_id: string;
  canonical_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  source: string;
  provider: string | null;
  calendar_id: string | null;
  event_id: string | null;
  access_role: string | null;
  writable: boolean;
  rsvp_status: "accepted" | "tentative" | "declined" | null;
  sync_state: CalendarSyncState;
  updated_at: string;
};

export type CalendarEventPatchRequest = {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  project_ids?: string[];
};

export type CalendarEventRsvpRequest = {
  status: "accepted" | "tentative" | "declined";
};

export type CalendarEventDeleteResponse = {
  canonical_id: string;
  status: "deleted";
  provider_action: "deleted" | "declined_fallback" | "local_only";
};

export type CalendarEventCreateRequest = {
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  project_ids?: string[];
};

export const CalendarApi = {
  listEvents: (params?: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    projectIds?: string[];
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set("date_from", params.dateFrom);
    if (params?.dateTo) searchParams.set("date_to", params.dateTo);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.projectIds) {
      for (const id of params.projectIds) {
        searchParams.append("project_ids", id);
      }
    }
    const qs = searchParams.toString();
    return request<CalendarEventResponse[]>(
      `/calendar/events${qs ? `?${qs}` : ""}`,
    );
  },

  createEvent: (
    payload: CalendarEventCreateRequest,
    idempotencyKey?: string,
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<CalendarEventResponse>("/calendar/events", {
      method: "POST",
      body: JSON.stringify(payload),
      headers,
    });
  },

  patchEvent: (
    canonicalId: string,
    payload: CalendarEventPatchRequest,
    idempotencyKey?: string,
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<CalendarEventResponse>(
      `/calendar/events/${encodeURIComponent(canonicalId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers,
      },
    );
  },

  setRsvp: (
    canonicalId: string,
    payload: CalendarEventRsvpRequest,
    idempotencyKey?: string,
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<CalendarEventResponse>(
      `/calendar/events/${encodeURIComponent(canonicalId)}/rsvp`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers,
      },
    );
  },

  deleteEvent: (canonicalId: string, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<CalendarEventDeleteResponse>(
      `/calendar/events/${encodeURIComponent(canonicalId)}`,
      {
        method: "DELETE",
        headers,
      },
    );
  },
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
// Chat API (Copilot)
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
  agentName?: string | null;
  devToolsEnabled?: boolean;
  provider: "openrouter" | "openai" | "anthropic";
  hasApiKey: boolean;
  model: string;
  containerStatus: string | null;
  containerError: string | null;
  validationStatus?: "ok" | "error" | "warning" | null;
  validationMessage?: string | null;
  modelAvailable?: boolean | null;
  creditsRemainingUsd?: number | null;
  creditsUsedUsd?: number | null;
  creditsLimitUsd?: number | null;
  lastValidatedAt?: string | null;
};

export type AgentContainerStatusResponse = {
  status: string | null;
  url: string | null;
  error: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  port: number | null;
};

export type AgentContainerHardRefreshResponse = {
  ok: boolean;
  removedWorkspace: boolean;
  removedRuntime: boolean;
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

  hardRefreshContainer: () =>
    request<AgentContainerHardRefreshResponse>(
      "/agent/container/hard-refresh",
      {
        method: "POST",
      },
    ),
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

  getContent: (itemId: string) =>
    request<ItemContentResponse>(`/items/${itemId}/content`),

  patchFileContent: (itemId: string, text: string) =>
    request<{ ok: boolean }>(`/items/${itemId}/file-content`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),

  appendContent: (itemId: string, text: string) =>
    request<{ ok: boolean }>(`/items/${itemId}/append-content`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
