/**
 * Shared mock API helpers for Playwright mocked integration tests.
 *
 * Provides `page.route()` interceptors and response builders so each
 * `-mocked.spec.ts` file can set up deterministic API responses without
 * duplicating boilerplate.
 */
import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// PropertyValue helper (mirrors api-seed.ts / MSW fixtures)
// ---------------------------------------------------------------------------

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue" as const, propertyID, value };
}

// ---------------------------------------------------------------------------
// Type aliases (keep in sync with frontend/src/lib/api-client.ts)
// ---------------------------------------------------------------------------

export type ItemRecord = {
  item_id: string;
  canonical_id: string;
  source: string;
  item: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SyncResponse = {
  items: ItemRecord[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;
};

export type OrgResponse = {
  id: string;
  name: string;
  role: string;
  created_at: string;
  doc_ids?: { general?: string; user?: string; log?: string; agent?: string };
};

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
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_message_count?: number | null;
  is_active: boolean;
  watch_active: boolean;
  watch_expires_at: string | null;
  created_at: string;
};

export type EmailCalendarResponse = {
  calendar_id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  access_role: string;
};

export type AgentSettingsResponse = {
  agentBackend: "haystack" | "openclaw";
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

export type FlushResponse = {
  ok: boolean;
  deleted: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

export function buildSyncResponse(items: ItemRecord[] = []): SyncResponse {
  return {
    items,
    next_cursor: null,
    has_more: false,
    server_time: new Date().toISOString(),
  };
}

let itemCounter = 0;

export function buildItemRecord(
  overrides: {
    bucket?: string;
    type?: string;
    name?: string;
    rawCapture?: string;
    isFocused?: boolean;
    orgDocType?: string;
    orgRole?: string;
    email?: string;
    telephone?: string;
    jobTitle?: string;
    orgRef?: { id: string; name: string };
    encodingFormat?: string;
    fileId?: string;
    downloadUrl?: string;
    origin?: string;
    projectId?: string;
    desiredOutcome?: string;
    projectStatus?: string;
    completedAt?: string;
  } = {},
): ItemRecord {
  itemCounter++;
  const now = new Date().toISOString();
  const bucket = overrides.bucket ?? "inbox";
  const type =
    overrides.type ??
    (overrides.orgDocType
      ? "DigitalDocument"
      : overrides.orgRole || overrides.email || overrides.telephone
        ? "Person"
        : bucket === "project"
          ? "Project"
          : bucket === "reference"
            ? "CreativeWork"
            : "Action");

  const id = `mock-item-${itemCounter}`;
  const canonicalId = `urn:app:${bucket === "project" ? "project" : bucket === "reference" ? "reference" : bucket === "inbox" ? "inbox" : "action"}:${id}`;
  const displayName =
    overrides.name ?? overrides.rawCapture ?? `Item ${itemCounter}`;

  const props: Array<Record<string, unknown>> = [
    pv("app:bucket", bucket),
    pv("app:needsEnrichment", bucket === "inbox"),
    pv("app:confidence", bucket === "inbox" ? "medium" : "high"),
    pv("app:captureSource", { kind: "thought" }),
    pv("app:ports", []),
    pv("app:typedReferences", []),
    pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
  ];

  // Action-specific
  if (["Action", "ReadAction"].includes(type)) {
    props.push(
      pv("app:rawCapture", overrides.rawCapture ?? displayName),
      pv("app:contexts", []),
      pv("app:isFocused", overrides.isFocused ?? false),
      pv("app:projectRefs", overrides.projectId ? [overrides.projectId] : []),
    );
  }

  // Project-specific
  if (type === "Project") {
    props.push(
      pv("app:desiredOutcome", overrides.desiredOutcome ?? ""),
      pv("app:projectStatus", overrides.projectStatus ?? "active"),
      pv("app:isFocused", overrides.isFocused ?? false),
    );
  }

  // Reference / CreativeWork / DigitalDocument
  if (
    ["CreativeWork", "DigitalDocument"].includes(type) &&
    !overrides.orgDocType &&
    !overrides.orgRole
  ) {
    props.push(
      pv("app:origin", overrides.origin ?? "captured"),
      pv("app:projectRefs", overrides.projectId ? [overrides.projectId] : []),
    );
  }

  // OrgDoc-specific
  if (overrides.orgDocType) {
    props.push(
      pv("app:orgDocType", overrides.orgDocType),
      pv("app:origin", "captured"),
      pv("app:projectRefs", []),
    );
  }

  // Person-specific (additionalProperty props only — top-level fields set after item creation)
  if (type === "Person") {
    if (overrides.orgRole) props.push(pv("app:orgRole", overrides.orgRole));
    // orgRef must be JSON-stringified — parseOrgRef() calls JSON.parse(raw)
    if (overrides.orgRef)
      props.push(pv("app:orgRef", JSON.stringify(overrides.orgRef)));
    props.push(pv("app:origin", "captured"), pv("app:projectRefs", []));
  }

  // File fields
  if (overrides.fileId) props.push(pv("app:fileId", overrides.fileId));
  if (overrides.downloadUrl)
    props.push(pv("app:downloadUrl", overrides.downloadUrl));

  const item: Record<string, unknown> = {
    "@id": canonicalId,
    "@type": type,
    _schemaVersion: 2,
    name: displayName,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
  };

  if (overrides.encodingFormat) {
    item.encodingFormat = overrides.encodingFormat;
  }

  // Person: email, telephone, jobTitle are top-level JSON-LD properties
  if (type === "Person") {
    if (overrides.email) item.email = overrides.email;
    if (overrides.telephone) item.telephone = overrides.telephone;
    if (overrides.jobTitle) item.jobTitle = overrides.jobTitle;
  }

  item.additionalProperty = props;

  return {
    item_id: id,
    canonical_id: canonicalId,
    source: "manual",
    item,
    created_at: now,
    updated_at: now,
  };
}

export function buildOrg(
  overrides: Partial<OrgResponse> & { name: string },
): OrgResponse {
  return {
    id: overrides.id ?? `org-${Date.now()}`,
    name: overrides.name,
    role: overrides.role ?? "owner",
    created_at: overrides.created_at ?? new Date().toISOString(),
    doc_ids: overrides.doc_ids,
  };
}

export function buildEmailConnection(
  overrides: Partial<EmailConnectionResponse> & { email_address: string },
): EmailConnectionResponse {
  return {
    connection_id: overrides.connection_id ?? `conn-${Date.now()}`,
    email_address: overrides.email_address,
    display_name: overrides.display_name ?? null,
    auth_method: "oauth2",
    oauth_provider: "gmail",
    sync_interval_minutes: overrides.sync_interval_minutes ?? 15,
    sync_mark_read: overrides.sync_mark_read ?? false,
    calendar_sync_enabled: overrides.calendar_sync_enabled ?? false,
    calendar_selected_ids: overrides.calendar_selected_ids ?? [],
    last_sync_at: overrides.last_sync_at ?? null,
    last_sync_error: overrides.last_sync_error ?? null,
    last_sync_message_count: overrides.last_sync_message_count ?? null,
    is_active: overrides.is_active ?? true,
    watch_active: overrides.watch_active ?? false,
    watch_expires_at: overrides.watch_expires_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

export function buildCalendar(
  overrides: Partial<EmailCalendarResponse> & {
    calendar_id: string;
    summary: string;
  },
): EmailCalendarResponse {
  return {
    calendar_id: overrides.calendar_id,
    summary: overrides.summary,
    primary: overrides.primary ?? false,
    selected: overrides.selected ?? false,
    access_role: overrides.access_role ?? "owner",
  };
}

export function buildAgentSettings(
  overrides?: Partial<AgentSettingsResponse>,
): AgentSettingsResponse {
  return {
    agentBackend: overrides?.agentBackend ?? "haystack",
    provider: overrides?.provider ?? "openrouter",
    hasApiKey: overrides?.hasApiKey ?? false,
    model: overrides?.model ?? "anthropic/claude-sonnet-4",
    containerStatus: overrides?.containerStatus ?? null,
    containerError: overrides?.containerError ?? null,
    validationStatus: overrides?.validationStatus ?? null,
    validationMessage: overrides?.validationMessage ?? null,
    modelAvailable: overrides?.modelAvailable ?? null,
    creditsRemainingUsd: overrides?.creditsRemainingUsd ?? null,
    creditsUsedUsd: overrides?.creditsUsedUsd ?? null,
    creditsLimitUsd: overrides?.creditsLimitUsd ?? null,
    lastValidatedAt: overrides?.lastValidatedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route interceptors
// ---------------------------------------------------------------------------

/** Mock the items sync endpoint (GET /items/sync) with a static response. */
export async function mockItemsSync(
  page: Page,
  items: ItemRecord[] = [],
): Promise<void> {
  await page.route("**/items/sync*", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSyncResponse(items)),
    }),
  );
}

/** Mock GET /orgs (list) and POST /orgs (create). */
export async function mockOrgsApi(
  page: Page,
  orgs: OrgResponse[],
  options?: { onCreateOrg?: (name: string) => OrgResponse },
): Promise<void> {
  await page.route("**/orgs", (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const newOrg =
        options?.onCreateOrg?.(body.name) ?? buildOrg({ name: body.name });
      orgs.push(newOrg);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newOrg),
      });
    }
    // GET
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(orgs),
    });
  });
}

/** Mock email connection endpoints. */
export async function mockEmailApi(
  page: Page,
  connections: EmailConnectionResponse[],
  calendars?: Record<string, EmailCalendarResponse[]>,
): Promise<void> {
  // GET /email/connections
  await page.route("**/email/connections", (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(connections),
      });
    }
    return route.continue();
  });

  // PATCH/DELETE /email/connections/:id
  await page.route("**/email/connections/*", (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Skip sub-resources (handled by more specific routes)
    if (url.includes("/sync") || url.includes("/calendars")) {
      return route.continue();
    }

    if (method === "PATCH") {
      // Merge PATCH body into the connection so calendar_sync_enabled updates propagate
      const body = route.request().postDataJSON() ?? {};
      if (connections[0]) Object.assign(connections[0], body);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(connections[0] ?? {}),
      });
    }
    if (method === "DELETE") {
      connections.length = 0;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });

  // POST /email/connections/:id/sync
  await page.route("**/email/connections/*/sync", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ synced: 5, created: 2, skipped: 3, errors: 0 }),
    }),
  );

  // GET /email/connections/:id/calendars
  await page.route("**/email/connections/*/calendars", (route: Route) => {
    const url = route.request().url();
    const connId = url.match(/connections\/([^/]+)\/calendars/)?.[1] ?? "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calendars?.[connId] ?? []),
    });
  });
}

/** Mock agent settings endpoints. */
export async function mockAgentApi(
  page: Page,
  settings: AgentSettingsResponse,
): Promise<void> {
  await page.route("**/agent/settings", (route: Route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      Object.assign(settings, body);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settings),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(settings),
    });
  });

  await page.route("**/agent/settings/api-key", (route: Route) => {
    if (route.request().method() === "DELETE") {
      settings.hasApiKey = false;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });

  await page.route("**/agent/status", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: settings.containerStatus ?? "stopped",
        error: settings.containerError,
      }),
    }),
  );

  await page.route("**/agent/container/stop", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route("**/agent/container/restart", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
}

/** Mock POST /dev/flush. */
export async function mockDevFlush(
  page: Page,
  response?: FlushResponse | { status: number },
): Promise<void> {
  await page.route("**/dev/flush", (route: Route) => {
    if (
      "status" in (response ?? {}) &&
      (response as { status: number }).status >= 400
    ) {
      return route.fulfill({
        status: (response as { status: number }).status,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Internal server error" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        response ?? { ok: true, deleted: { items: 42, files: 5 } },
      ),
    });
  });
}

/** Mock GET /items/:id/content for OrgDoc editing. */
export async function mockItemContent(
  page: Page,
  contentMap: Record<string, string>,
): Promise<void> {
  await page.route("**/items/*/content", (route: Route) => {
    const url = route.request().url();
    // Extract canonical_id from URL: /items/{canonical_id}/content
    const match = url.match(/items\/([^/]+)\/content/);
    const rawId = match?.[1] ?? "";
    // Decode URL-encoded colons (urn:app:reference:... → urn%3Aapp%3A...)
    const itemId = decodeURIComponent(rawId);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        file_content: contentMap[itemId] ?? "",
      }),
    });
  });
}

/** Mock PATCH /items/:id/file-content and POST /items/:id/append-content. */
export async function mockItemMutations(page: Page): Promise<void> {
  await page.route("**/items/*/file-content", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route("**/items/*/append-content", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
}

/** Mock PATCH and DELETE /items/:id for update and archive operations. */
export async function mockItemPatch(page: Page): Promise<void> {
  await page.route("**/items/*", (route: Route) => {
    const method = route.request().method();
    if (method === "PATCH" || method === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });
}

/** Reset the internal item counter (for test isolation). */
export function resetMockCounter(): void {
  itemCounter = 0;
}

/**
 * Reload the page so that all subsequent API fetches hit the mocked routes
 * instead of returning cached data from the real backend.
 *
 * Also dismisses the dev/demo disclaimer dialog if it reappears.
 */
export async function reloadWithMocks(page: Page): Promise<void> {
  const syncResponse = page.waitForResponse((r) =>
    r.url().includes("/items/sync"),
  );
  await page.reload();
  await syncResponse;

  // Dismiss dev/demo disclaimer if it reappears after reload
  const btn = page.getByRole("button", { name: "I understand" });
  if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await btn.click();
  }
}
