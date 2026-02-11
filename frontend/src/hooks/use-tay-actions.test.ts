import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTayActions } from "./use-tay-actions";
import type { TaySuggestion } from "@/model/chat-types";
import type { ItemRecord } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Mock mutation hooks
// ---------------------------------------------------------------------------

const mockCreateProjectAsync = vi.fn();
const mockAddProjectActionAsync = vi.fn();
const mockCaptureInboxAsync = vi.fn();
const mockAddReferenceAsync = vi.fn();

vi.mock("./use-mutations", () => ({
  useCreateProject: () => ({ mutateAsync: mockCreateProjectAsync }),
  useAddProjectAction: () => ({ mutateAsync: mockAddProjectActionAsync }),
  useCaptureInbox: () => ({ mutateAsync: mockCaptureInboxAsync }),
  useAddReference: () => ({ mutateAsync: mockAddReferenceAsync }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(canonical_id: string): ItemRecord {
  return {
    item_id: `tid-${canonical_id}`,
    canonical_id,
    source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    item: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockCreateProjectAsync.mockResolvedValue(makeRecord("urn:app:project:p1"));
  mockAddProjectActionAsync.mockResolvedValue(makeRecord("urn:app:action:a1"));
  mockCaptureInboxAsync.mockResolvedValue(makeRecord("urn:app:inbox:i1"));
  mockAddReferenceAsync.mockResolvedValue(makeRecord("urn:app:reference:r1"));
});

describe("useTayActions", () => {
  describe("create_project_with_actions", () => {
    const suggestion: TaySuggestion = {
      type: "create_project_with_actions",
      project: { name: "Geburtstagsfeier", desiredOutcome: "Party!" },
      actions: [
        { name: "Gästeliste", bucket: "next" },
        { name: "Einladungen", bucket: "next" },
      ],
      documents: [{ name: "Vorlage" }],
    };

    it("creates project, then actions, then documents", async () => {
      // Return unique IDs per call
      mockAddProjectActionAsync
        .mockResolvedValueOnce(makeRecord("urn:app:action:a1"))
        .mockResolvedValueOnce(makeRecord("urn:app:action:a2"));

      const { result } = renderHook(() => useTayActions());
      let created!: Awaited<
        ReturnType<typeof result.current.executeSuggestion>
      >;

      await act(async () => {
        created = await result.current.executeSuggestion(suggestion);
      });

      // Project created first
      expect(mockCreateProjectAsync).toHaveBeenCalledWith({
        name: "Geburtstagsfeier",
        desiredOutcome: "Party!",
      });

      // Actions created with project ID
      expect(mockAddProjectActionAsync).toHaveBeenCalledTimes(2);
      expect(mockAddProjectActionAsync).toHaveBeenCalledWith({
        projectId: "urn:app:project:p1",
        title: "Gästeliste",
      });
      expect(mockAddProjectActionAsync).toHaveBeenCalledWith({
        projectId: "urn:app:project:p1",
        title: "Einladungen",
      });

      // Document created
      expect(mockAddReferenceAsync).toHaveBeenCalledWith("Vorlage");

      // Returns all created refs
      expect(created).toHaveLength(4);
      expect(created[0]).toEqual({
        canonicalId: "urn:app:project:p1",
        name: "Geburtstagsfeier",
        type: "project",
      });
      expect(created[1]!.type).toBe("action");
      expect(created[2]!.type).toBe("action");
      expect(created[3]!.type).toBe("reference");
    });

    it("skips documents when not present", async () => {
      const noDocSuggestion: TaySuggestion = {
        type: "create_project_with_actions",
        project: { name: "Test", desiredOutcome: "Done" },
        actions: [{ name: "Step 1", bucket: "next" }],
      };

      const { result } = renderHook(() => useTayActions());

      await act(async () => {
        await result.current.executeSuggestion(noDocSuggestion);
      });

      expect(mockAddReferenceAsync).not.toHaveBeenCalled();
    });

    it("propagates project creation failure", async () => {
      mockCreateProjectAsync.mockRejectedValue(new Error("API error"));
      const { result } = renderHook(() => useTayActions());

      await expect(
        act(() => result.current.executeSuggestion(suggestion)),
      ).rejects.toThrow("API error");

      expect(mockAddProjectActionAsync).not.toHaveBeenCalled();
    });
  });

  describe("create_action", () => {
    it("captures inbox item", async () => {
      const suggestion: TaySuggestion = {
        type: "create_action",
        name: "Einkaufen",
        bucket: "next",
      };

      const { result } = renderHook(() => useTayActions());
      let created!: Awaited<
        ReturnType<typeof result.current.executeSuggestion>
      >;

      await act(async () => {
        created = await result.current.executeSuggestion(suggestion);
      });

      expect(mockCaptureInboxAsync).toHaveBeenCalledWith("Einkaufen");
      expect(created).toHaveLength(1);
      expect(created[0]).toEqual({
        canonicalId: "urn:app:inbox:i1",
        name: "Einkaufen",
        type: "action",
      });
    });
  });

  describe("create_reference", () => {
    it("creates reference", async () => {
      const suggestion: TaySuggestion = {
        type: "create_reference",
        name: "Styleguide",
      };

      const { result } = renderHook(() => useTayActions());
      let created!: Awaited<
        ReturnType<typeof result.current.executeSuggestion>
      >;

      await act(async () => {
        created = await result.current.executeSuggestion(suggestion);
      });

      expect(mockAddReferenceAsync).toHaveBeenCalledWith("Styleguide");
      expect(created).toHaveLength(1);
      expect(created[0]).toEqual({
        canonicalId: "urn:app:reference:r1",
        name: "Styleguide",
        type: "reference",
      });
    });
  });

  it("returns correct canonicalId from server response", async () => {
    mockCaptureInboxAsync.mockResolvedValue(
      makeRecord("urn:app:inbox:custom-id-42"),
    );

    const { result } = renderHook(() => useTayActions());
    let created!: Awaited<ReturnType<typeof result.current.executeSuggestion>>;

    await act(async () => {
      created = await result.current.executeSuggestion({
        type: "create_action",
        name: "Test",
        bucket: "inbox",
      });
    });

    expect(created[0]!.canonicalId).toBe("urn:app:inbox:custom-id-42");
  });
});
