import { CopilotHttpClient, type HttpClientOptions } from "./http.js";

export type OrgResponse = {
  id: string;
  name: string;
  role: string;
  created_at: string;
};

export type ItemRecord = {
  item_id: string;
  canonical_id: string;
  source: string;
  item: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ItemContentRecord = {
  item_id: string;
  canonical_id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  bucket: string | null;
  file_content: string | null;
  file_name: string | null;
};

export type WorkflowTransitionRecord = {
  from_status: string;
  to_status: string;
};

export type WorkflowDefinitionRecord = {
  policy_mode: string;
  default_status: string;
  done_statuses: string[];
  blocked_statuses: string[];
  canonical_statuses: string[];
  column_labels: Record<string, string>;
  transitions: WorkflowTransitionRecord[];
};

export type ProjectMemberRecord = {
  project_id: string;
  user_id: string;
  email: string;
  role: string;
  is_owner: boolean;
  added_at: string;
  added_by: string | null;
};

export type ProjectMemberDeleteRecord = {
  ok: boolean;
  project_id: string;
  user_id: string;
};

export type ActionCommentRecord = {
  id: string;
  action_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ActionRevisionRecord = {
  id: number;
  action_id: string;
  actor_id: string;
  diff: Record<string, unknown>;
  created_at: string;
};

export type ActionTransitionEventRecord = {
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

export type ProjectActionRecord = {
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

export type ProjectActionDetailRecord = ProjectActionRecord & {
  comments: ActionCommentRecord[];
  revisions: ActionRevisionRecord[];
};

export type ProjectActionHistoryRecord = {
  transitions: ActionTransitionEventRecord[];
  revisions: ActionRevisionRecord[];
};

export type ProjectActionListParams = {
  status?: string[];
  tag?: string;
  ownerUserId?: string;
  dueBefore?: string;
  dueAfter?: string;
};

export type ProjectActionCreatePayload = {
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

export type ProjectActionUpdatePayload = {
  name?: string;
  description?: string;
  owner_user_id?: string;
  owner_text?: string;
  due_at?: string;
  tags?: string[];
  object_ref?: Record<string, unknown> | null;
  attributes?: Record<string, unknown>;
};

export type ProjectActionTransitionPayload = {
  to_status: string;
  reason?: string;
  payload?: Record<string, unknown>;
  correlation_id?: string;
  expected_last_event_id?: number;
};

export type ProjectActionCommentPayload = {
  body: string;
  parent_comment_id?: string;
};

export type SyncResponse = {
  items: ItemRecord[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;
};

export type NotificationEventRecord = {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at?: string | null;
};

export type CalendarEventRecord = {
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
  rsvp_status: string | null;
  sync_state: "Synced" | "Saving" | "Sync failed" | "Local only";
  updated_at: string;
};

export type CalendarEventPatchPayload = {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
};

export type CalendarEventRsvpPayload = {
  status: "accepted" | "tentative" | "declined";
};

export type CalendarEventDeleteRecord = {
  canonical_id: string;
  status: "deleted";
  provider_action: "deleted" | "declined_fallback" | "local_only";
};

export type CalendarEventListParams = {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type NotificationSendPayload = {
  kind?: string;
  title: string;
  body: string;
  url?: string | null;
  payload?: Record<string, unknown>;
  target_user_id?: string;
};

export type StoredUser = {
  id: string;
  email: string;
  username?: string | null;
  default_org_id?: string | null;
  created_at: string;
};

export class CopilotApi {
  private client: CopilotHttpClient;

  private constructor(client: CopilotHttpClient) {
    this.client = client;
  }

  static async create(options: HttpClientOptions): Promise<CopilotApi> {
    const client = await CopilotHttpClient.create(options);
    return new CopilotApi(client);
  }

  get http(): CopilotHttpClient {
    return this.client;
  }

  // Auth
  register(email: string, password: string, username?: string) {
    return this.client.register(email, password, username);
  }

  login(email: string, password: string) {
    return this.client.login(email, password);
  }

  me() {
    return this.client.me();
  }

  logout() {
    return this.client.logout();
  }

  // Orgs
  listOrgs() {
    return this.client.requestJson<OrgResponse[]>("/orgs", { method: "GET" });
  }

  // Notifications
  listNotifications(params?: { cursor?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return this.client.requestJson<NotificationEventRecord[]>(
      `/notifications${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  sendNotification(payload: NotificationSendPayload) {
    return this.client.requestJson<NotificationEventRecord>(
      "/notifications/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  // Items
  listItems(limit = 100, offset = 0) {
    return this.client.requestJson<ItemRecord[]>(
      `/items?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      },
    );
  }

  syncItems(params?: {
    limit?: number;
    cursor?: string;
    since?: string;
    completed?: "false" | "true" | "all";
  }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.since) searchParams.set("since", params.since);
    if (params?.completed) searchParams.set("completed", params.completed);
    const query = searchParams.toString();
    return this.client.requestJson<SyncResponse>(
      `/items/sync${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    );
  }

  async listAllItems(options?: {
    perPage?: number;
    maxPages?: number;
    completed?: "false" | "true" | "all";
  }): Promise<ItemRecord[]> {
    const perPage = options?.perPage ?? 200;
    const maxPages = options?.maxPages ?? 25;
    const completed = options?.completed ?? "all";

    const all: ItemRecord[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.syncItems({
        limit: perPage,
        cursor,
        completed,
      });
      all.push(...response.items);
      if (!response.has_more || !response.next_cursor) {
        break;
      }
      cursor = response.next_cursor;
    }

    return all;
  }

  getItem(itemId: string) {
    return this.client.requestJson<ItemRecord>(`/items/${itemId}`, {
      method: "GET",
    });
  }

  getItemContent(itemId: string) {
    return this.client.requestJson<ItemContentRecord>(
      `/items/${itemId}/content`,
      {
        method: "GET",
      },
    );
  }

  createItem(item: Record<string, unknown>, source = "senticor-copilot-cli") {
    return this.client.requestJson<ItemRecord>(
      "/items",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ item, source }),
      },
      { retryOnAuth: true },
    );
  }

  patchItem(
    itemId: string,
    patch: Record<string, unknown>,
    options?: {
      source?: string;
      idempotencyKey?: string;
      nameSource?: string;
    },
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    return this.client.requestJson<ItemRecord>(
      `/items/${itemId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          item: patch,
          source: options?.source ?? "senticor-copilot-cli",
          ...(options?.nameSource ? { name_source: options.nameSource } : {}),
        }),
      },
      { retryOnAuth: true },
    );
  }

  // Projects
  listProjectItems(projectId: string) {
    return this.client.requestJson<Array<Record<string, unknown>>>(
      `/items/by-project/${projectId}`,
      {
        method: "GET",
      },
    );
  }

  // Collaboration
  getProjectWorkflow(projectId: string) {
    return this.client.requestJson<WorkflowDefinitionRecord>(
      `/projects/${projectId}/workflow`,
      {
        method: "GET",
      },
    );
  }

  listProjectMembers(projectId: string) {
    return this.client.requestJson<ProjectMemberRecord[]>(
      `/projects/${projectId}/members`,
      {
        method: "GET",
      },
    );
  }

  addProjectMember(
    projectId: string,
    payload: {
      email: string;
      role?: string;
    },
  ) {
    return this.client.requestJson<ProjectMemberRecord>(
      `/projects/${projectId}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  removeProjectMember(projectId: string, targetUserId: string) {
    return this.client.requestJson<ProjectMemberDeleteRecord>(
      `/projects/${projectId}/members/${targetUserId}`,
      {
        method: "DELETE",
      },
      { retryOnAuth: true },
    );
  }

  listProjectActions(projectId: string, params?: ProjectActionListParams) {
    const search = new URLSearchParams();
    for (const status of params?.status ?? []) {
      if (status) {
        search.append("status", status);
      }
    }
    if (params?.tag) {
      search.set("tag", params.tag);
    }
    if (params?.ownerUserId) {
      search.set("owner_user_id", params.ownerUserId);
    }
    if (params?.dueBefore) {
      search.set("due_before", params.dueBefore);
    }
    if (params?.dueAfter) {
      search.set("due_after", params.dueAfter);
    }
    const query = search.toString();
    return this.client.requestJson<ProjectActionRecord[]>(
      `/projects/${projectId}/actions${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  getProjectAction(projectId: string, actionId: string) {
    return this.client.requestJson<ProjectActionDetailRecord>(
      `/projects/${projectId}/actions/${actionId}`,
      {
        method: "GET",
      },
    );
  }

  getProjectActionHistory(projectId: string, actionId: string) {
    return this.client.requestJson<ProjectActionHistoryRecord>(
      `/projects/${projectId}/actions/${actionId}/history`,
      {
        method: "GET",
      },
    );
  }

  createProjectAction(projectId: string, payload: ProjectActionCreatePayload) {
    return this.client.requestJson<ProjectActionRecord>(
      `/projects/${projectId}/actions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  updateProjectAction(
    projectId: string,
    actionId: string,
    payload: ProjectActionUpdatePayload,
  ) {
    return this.client.requestJson<ProjectActionRecord>(
      `/projects/${projectId}/actions/${actionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  transitionProjectAction(
    projectId: string,
    actionId: string,
    payload: ProjectActionTransitionPayload,
  ) {
    return this.client.requestJson<ProjectActionRecord>(
      `/projects/${projectId}/actions/${actionId}/transition`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  addProjectActionComment(
    projectId: string,
    actionId: string,
    payload: ProjectActionCommentPayload,
  ) {
    return this.client.requestJson<ActionCommentRecord>(
      `/projects/${projectId}/actions/${actionId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  // Calendar
  listCalendarEvents(params?: CalendarEventListParams) {
    const search = new URLSearchParams();
    if (params?.dateFrom) search.set("date_from", params.dateFrom);
    if (params?.dateTo) search.set("date_to", params.dateTo);
    if (params?.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return this.client.requestJson<CalendarEventRecord[]>(
      `/calendar/events${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  patchCalendarEvent(canonicalId: string, payload: CalendarEventPatchPayload) {
    return this.client.requestJson<CalendarEventRecord>(
      `/calendar/events/${canonicalId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  setCalendarEventRsvp(canonicalId: string, payload: CalendarEventRsvpPayload) {
    return this.client.requestJson<CalendarEventRecord>(
      `/calendar/events/${canonicalId}/rsvp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { retryOnAuth: true },
    );
  }

  deleteCalendarEvent(canonicalId: string) {
    return this.client.requestJson<CalendarEventDeleteRecord>(
      `/calendar/events/${canonicalId}`,
      {
        method: "DELETE",
      },
      { retryOnAuth: true },
    );
  }
}
