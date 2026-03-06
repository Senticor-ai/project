import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

import { get, set, del } from "idb-keyval";
import {
  getCachedAuthUser,
  setCachedAuthUser,
  clearCachedAuthUser,
  AUTH_USER_KEY,
} from "./auth-cache";
import type { AuthUser } from "./api-client";

const mocked = {
  get: vi.mocked(get),
  set: vi.mocked(set),
  del: vi.mocked(del),
};

const MOCK_USER: AuthUser = {
  id: "u-1",
  email: "test@example.com",
  username: "test",
  created_at: "2026-01-01T00:00:00Z",
};

describe("auth-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCachedAuthUser", () => {
    it("returns null when nothing stored", async () => {
      mocked.get.mockResolvedValue(undefined);

      const result = await getCachedAuthUser();

      expect(mocked.get).toHaveBeenCalledWith(AUTH_USER_KEY);
      expect(result).toBeNull();
    });

    it("returns stored user", async () => {
      mocked.get.mockResolvedValue(MOCK_USER);

      const result = await getCachedAuthUser();

      expect(result).toEqual(MOCK_USER);
    });

    it("returns null on IDB error", async () => {
      mocked.get.mockRejectedValue(new Error("IDB unavailable"));

      const result = await getCachedAuthUser();

      expect(result).toBeNull();
    });
  });

  describe("setCachedAuthUser", () => {
    it("stores user in IDB", async () => {
      mocked.set.mockResolvedValue(undefined);

      await setCachedAuthUser(MOCK_USER);

      expect(mocked.set).toHaveBeenCalledWith(AUTH_USER_KEY, MOCK_USER);
    });

    it("silently ignores IDB errors", async () => {
      mocked.set.mockRejectedValue(new Error("Quota exceeded"));

      await expect(setCachedAuthUser(MOCK_USER)).resolves.toBeUndefined();
    });
  });

  describe("clearCachedAuthUser", () => {
    it("deletes the IDB key", async () => {
      mocked.del.mockResolvedValue(undefined);

      await clearCachedAuthUser();

      expect(mocked.del).toHaveBeenCalledWith(AUTH_USER_KEY);
    });

    it("silently ignores IDB errors", async () => {
      mocked.del.mockRejectedValue(new Error("IDB broken"));

      await expect(clearCachedAuthUser()).resolves.toBeUndefined();
    });
  });
});
