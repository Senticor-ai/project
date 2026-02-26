import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotSuggestionCard } from "./CopilotSuggestionCard";
import type {
  CreateProjectWithActionsSuggestion,
  CreateActionSuggestion,
  CreateReferenceSuggestion,
  RenderCvSuggestion,
  CopilotCliSuggestion,
} from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";

const projectSuggestion: CreateProjectWithActionsSuggestion = {
  type: "create_project_with_actions",
  project: {
    name: "Geburtstagsfeier planen",
    desiredOutcome: "Erfolgreiche Geburtstagsfeier",
  },
  actions: [
    { name: "Gästeliste erstellen", bucket: "next" },
    { name: "Einladungen versenden", bucket: "next" },
    { name: "Location buchen", bucket: "next" },
  ],
  documents: [{ name: "Einladungsvorlage" }],
};

const actionSuggestion: CreateActionSuggestion = {
  type: "create_action",
  name: "Milch kaufen",
  bucket: "next",
};

const referenceSuggestion: CreateReferenceSuggestion = {
  type: "create_reference",
  name: "Rezeptsammlung",
  description: "Lieblingsrezepte für die Party",
};

describe("CopilotSuggestionCard", () => {
  describe("project suggestion (pending)", () => {
    it("renders project name", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Geburtstagsfeier planen")).toBeInTheDocument();
    });

    it("renders desired outcome", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Erfolgreiche Geburtstagsfeier"),
      ).toBeInTheDocument();
    });

    it("renders all actions", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Gästeliste erstellen")).toBeInTheDocument();
      expect(screen.getByText("Einladungen versenden")).toBeInTheDocument();
      expect(screen.getByText("Location buchen")).toBeInTheDocument();
    });

    it("renders documents when present", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Einladungsvorlage")).toBeInTheDocument();
    });

    it("renders accept and dismiss buttons", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Übernehmen" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Verwerfen" }),
      ).toBeInTheDocument();
    });

    it("calls onAccept when accept button clicked", async () => {
      const user = userEvent.setup();
      const onAccept = vi.fn();
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={onAccept}
          onDismiss={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Übernehmen" }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it("calls onDismiss when dismiss button clicked", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={onDismiss}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Verwerfen" }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe("action suggestion", () => {
    it("renders action name", () => {
      render(
        <CopilotSuggestionCard
          suggestion={actionSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Milch kaufen")).toBeInTheDocument();
    });

    it("renders bucket label", () => {
      render(
        <CopilotSuggestionCard
          suggestion={actionSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText(/Next/i)).toBeInTheDocument();
    });
  });

  describe("reference suggestion", () => {
    it("renders reference name and description", () => {
      render(
        <CopilotSuggestionCard
          suggestion={referenceSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Rezeptsammlung")).toBeInTheDocument();
      expect(
        screen.getByText("Lieblingsrezepte für die Party"),
      ).toBeInTheDocument();
    });
  });

  describe("render_cv suggestion", () => {
    const cvSuggestion: RenderCvSuggestion = {
      type: "render_cv",
      sourceItemId: "urn:app:reference:md-cv-1" as CanonicalId,
      css: "body { font-family: Inter; }",
      filename: "lebenslauf-angepasst.pdf",
      projectId: "urn:app:project:123" as CanonicalId,
    };

    it("renders filename", () => {
      render(
        <CopilotSuggestionCard
          suggestion={cvSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("lebenslauf-angepasst.pdf")).toBeInTheDocument();
    });

    it("renders markdown reference indicator", () => {
      render(
        <CopilotSuggestionCard
          suggestion={cvSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Aus Markdown-Referenz rendern"),
      ).toBeInTheDocument();
    });
  });

  describe("copilot_cli suggestion", () => {
    it("renders human readable summary with expandable technical details", () => {
      const cliSuggestion: CopilotCliSuggestion = {
        type: "copilot_cli",
        argv: [
          "projects",
          "actions",
          "update",
          "urn:app:action:019c5293-e445-72ff-9dff-d19e5b24aead",
          "--project-id",
          "urn:app:project:c16ebac6-a5ca-41ff-97db-567e67b5c7e3",
          "--name",
          "Steuerberater kontaktieren",
          "--apply",
        ],
      };

      render(
        <CopilotSuggestionCard
          suggestion={cliSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Projektaktion aktualisieren"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Neuer Titel: Steuerberater kontaktieren"),
      ).toBeInTheDocument();
      expect(screen.getByText("Technische Details")).toBeInTheDocument();
      expect(
        screen.getByText(/projects actions update urn:app:action:/i),
      ).toBeInTheDocument();
    });

    it("renders readable intent fallback when argv is missing", () => {
      const cliSuggestion: CopilotCliSuggestion = {
        type: "copilot_cli",
        intent: {
          schemaVersion: "copilot.intent.v0",
          kind: "weekly_review_plan",
        },
      };

      render(
        <CopilotSuggestionCard
          suggestion={cliSuggestion}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByText("Copilot-Intent ausführen")).toBeInTheDocument();
      expect(
        screen.getByText("Intent: weekly review plan"),
      ).toBeInTheDocument();
      expect(screen.getByText("Technische Details")).toBeInTheDocument();
    });
  });

  describe("accepted state", () => {
    it("shows accepted label instead of buttons", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="accepted"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Übernommen")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Übernehmen" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("dismissed state", () => {
    it("shows dismissed label", () => {
      render(
        <CopilotSuggestionCard
          suggestion={projectSuggestion}
          status="dismissed"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Vorschlag verworfen")).toBeInTheDocument();
    });
  });
});
