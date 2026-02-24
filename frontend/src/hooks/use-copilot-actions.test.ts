import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCopilotActions } from "./use-copilot-actions";
import type { CopilotSuggestion } from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";
import type { ExecuteToolResponse } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Mock ChatApi
// ---------------------------------------------------------------------------

const mockExecuteTool = vi.fn<(req: unknown) => Promise<ExecuteToolResponse>>();

vi.mock("@/lib/api-client", () => ({
  ChatApi: {
    executeTool: (req: unknown) => mockExecuteTool(req),
  },
}));

// ---------------------------------------------------------------------------
// Mock react-query (invalidateQueries)
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockInvalidateQueries.mockResolvedValue(undefined);
});

describe("useCopilotActions", () => {
  describe("calls ChatApi.executeTool with correct payload", () => {
    it("create_action", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        createdItems: [
          {
            canonicalId: "urn:app:action:a1",
            name: "Einkaufen",
            type: "action",
          },
        ],
      });

      const { result } = renderHook(() => useCopilotActions());

      const suggestion: CopilotSuggestion = {
        type: "create_action",
        name: "Einkaufen",
        bucket: "next",
      };

      await act(async () => {
        await result.current.executeSuggestion(suggestion, "conv-42");
      });

      expect(mockExecuteTool).toHaveBeenCalledWith({
        toolCall: {
          name: "create_action",
          arguments: suggestion,
        },
        conversationId: "conv-42",
      });
    });

    it("create_project_with_actions", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        createdItems: [
          { canonicalId: "urn:app:project:p1", name: "Umzug", type: "project" },
          { canonicalId: "urn:app:action:a1", name: "Kartons", type: "action" },
        ],
      });

      const suggestion: CopilotSuggestion = {
        type: "create_project_with_actions",
        project: { name: "Umzug", desiredOutcome: "Neue Wohnung" },
        actions: [{ name: "Kartons", bucket: "next" }],
      };

      const { result } = renderHook(() => useCopilotActions());

      await act(async () => {
        await result.current.executeSuggestion(suggestion, "conv-99");
      });

      expect(mockExecuteTool).toHaveBeenCalledWith({
        toolCall: {
          name: "create_project_with_actions",
          arguments: suggestion,
        },
        conversationId: "conv-99",
      });
    });

    it("create_reference", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        createdItems: [
          {
            canonicalId: "urn:app:reference:r1",
            name: "Styleguide",
            type: "reference",
          },
        ],
      });

      const suggestion: CopilotSuggestion = {
        type: "create_reference",
        name: "Styleguide",
      };

      const { result } = renderHook(() => useCopilotActions());

      await act(async () => {
        await result.current.executeSuggestion(suggestion, "conv-7");
      });

      expect(mockExecuteTool).toHaveBeenCalledWith({
        toolCall: {
          name: "create_reference",
          arguments: suggestion,
        },
        conversationId: "conv-7",
      });
    });

    it("render_cv", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        createdItems: [
          {
            canonicalId: "urn:app:reference:cv1",
            name: "lebenslauf.pdf",
            type: "reference",
          },
        ],
      });

      const suggestion: CopilotSuggestion = {
        type: "render_cv",
        sourceItemId: "urn:app:reference:md-cv-1" as CanonicalId,
        css: "body { font-family: Inter; }",
        filename: "lebenslauf.pdf",
        projectId: "urn:app:project:p1" as CanonicalId,
      };

      const { result } = renderHook(() => useCopilotActions());

      await act(async () => {
        await result.current.executeSuggestion(suggestion, "conv-cv");
      });

      expect(mockExecuteTool).toHaveBeenCalledWith({
        toolCall: {
          name: "render_cv",
          arguments: suggestion,
        },
        conversationId: "conv-cv",
      });
    });

    it("copilot_cli intent payload", async () => {
      mockExecuteTool.mockResolvedValueOnce({ createdItems: [] });

      const suggestion: CopilotSuggestion = {
        type: "copilot_cli",
        intent: {
          schemaVersion: "copilot.intent.v0",
          kind: "weekly_review_plan",
          focusOn: ["urn:app:action:a1"],
        },
      };

      const { result } = renderHook(() => useCopilotActions());

      await act(async () => {
        await result.current.executeSuggestion(suggestion, "conv-intent");
      });

      expect(mockExecuteTool).toHaveBeenCalledWith({
        toolCall: {
          name: "copilot_cli",
          arguments: {
            intent: suggestion.intent,
          },
        },
        conversationId: "conv-intent",
      });
    });
  });

  it("passes conversationId to API", async () => {
    mockExecuteTool.mockResolvedValueOnce({ createdItems: [] });

    const { result } = renderHook(() => useCopilotActions());

    await act(async () => {
      await result.current.executeSuggestion(
        { type: "create_action", name: "Test", bucket: "next" },
        "conv-specific-id",
      );
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-specific-id" }),
    );
  });

  it("returns mapped CreatedItemRef[]", async () => {
    mockExecuteTool.mockResolvedValueOnce({
      createdItems: [
        {
          canonicalId: "urn:app:project:p1",
          name: "Geburtstagsfeier",
          type: "project",
        },
        {
          canonicalId: "urn:app:action:a1",
          name: "Gästeliste",
          type: "action",
        },
        {
          canonicalId: "urn:app:action:a2",
          name: "Einladungen",
          type: "action",
        },
        {
          canonicalId: "urn:app:reference:r1",
          name: "Vorlage",
          type: "reference",
        },
      ],
    });

    const { result } = renderHook(() => useCopilotActions());
    let created!: Awaited<ReturnType<typeof result.current.executeSuggestion>>;

    await act(async () => {
      created = await result.current.executeSuggestion(
        {
          type: "create_project_with_actions",
          project: { name: "Geburtstagsfeier", desiredOutcome: "Party!" },
          actions: [
            { name: "Gästeliste", bucket: "next" },
            { name: "Einladungen", bucket: "next" },
          ],
          documents: [{ name: "Vorlage" }],
        },
        "conv-1",
      );
    });

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

  it("invalidates items cache after execution", async () => {
    mockExecuteTool.mockResolvedValueOnce({ createdItems: [] });

    const { result } = renderHook(() => useCopilotActions());

    await act(async () => {
      await result.current.executeSuggestion(
        { type: "create_action", name: "Test", bucket: "next" },
        "conv-1",
      );
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["items"],
    });
  });

  it("onItemsChanged invalidates items cache", async () => {
    const { result } = renderHook(() => useCopilotActions());

    await act(async () => {
      await result.current.onItemsChanged();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["items"],
    });
  });

  it("propagates API errors", async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(() => useCopilotActions());

    await expect(
      act(() =>
        result.current.executeSuggestion(
          { type: "create_action", name: "Test", bucket: "next" },
          "conv-1",
        ),
      ),
    ).rejects.toThrow("Server error");
  });
});
