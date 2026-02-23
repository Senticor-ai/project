import { TayHttpClient, type HttpClientOptions } from "./http.js";

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

export type SyncResponse = {
  items: ItemRecord[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;
};

export type StoredUser = {
  id: string;
  email: string;
  username?: string | null;
  default_org_id?: string | null;
  created_at: string;
};

export class TayApi {
  private client: TayHttpClient;

  private constructor(client: TayHttpClient) {
    this.client = client;
  }

  static async create(options: HttpClientOptions): Promise<TayApi> {
    const client = await TayHttpClient.create(options);
    return new TayApi(client);
  }

  get http(): TayHttpClient {
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

  // Items
  listItems(limit = 100, offset = 0) {
    return this.client.requestJson<ItemRecord[]>(`/items?limit=${limit}&offset=${offset}`, {
      method: "GET",
    });
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
    return this.client.requestJson<SyncResponse>(`/items/sync${query ? `?${query}` : ""}`, {
      method: "GET",
    });
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
    return this.client.requestJson<ItemRecord>(`/items/${itemId}`, { method: "GET" });
  }

  getItemContent(itemId: string) {
    return this.client.requestJson<ItemContentRecord>(`/items/${itemId}/content`, {
      method: "GET",
    });
  }

  createItem(item: Record<string, unknown>, source = "tay-cli") {
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
          source: options?.source ?? "tay-cli",
          ...(options?.nameSource ? { name_source: options.nameSource } : {}),
        }),
      },
      { retryOnAuth: true },
    );
  }

  // Projects
  listProjectItems(projectId: string) {
    return this.client.requestJson<Array<Record<string, unknown>>>(`/items/by-project/${projectId}`, {
      method: "GET",
    });
  }
}
