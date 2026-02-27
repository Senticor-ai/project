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
import type { ActionItemBucket } from "@/model/types";

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

    it("renders items focus set", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "focus", "urn:app:action:abc"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Fokus auf ein Element setzen"),
      ).toBeInTheDocument();
      expect(screen.getByText("Element: abc")).toBeInTheDocument();
    });

    it("renders items focus remove with --off flag", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "focus", "urn:app:action:abc", "--off"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Fokus bei einem Element entfernen"),
      ).toBeInTheDocument();
    });

    it("renders items triage with bucket and status", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "triage", "--bucket", "next", "--status", "open"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Element umsortieren")).toBeInTheDocument();
      expect(screen.getByText("Bucket: Next")).toBeInTheDocument();
      expect(screen.getByText("Status: open")).toBeInTheDocument();
    });

    it("renders items triage to completed", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "triage", "--bucket", "completed"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Element als erledigt markieren"),
      ).toBeInTheDocument();
    });

    it("renders items create for action", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: [
              "items",
              "create",
              "--type",
              "Action",
              "--name",
              "Test",
              "--bucket",
              "inbox",
            ],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Aktion erstellen")).toBeInTheDocument();
      expect(screen.getByText("Titel: Test")).toBeInTheDocument();
      expect(screen.getByText("Bucket: Inbox")).toBeInTheDocument();
    });

    it("renders items create for project", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "create", "--type=Project", "--name=Neues Projekt"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Projekt erstellen")).toBeInTheDocument();
    });

    it("renders items create for reference", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["items", "create", "--type", "CreativeWork"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Referenz erstellen")).toBeInTheDocument();
    });

    it("renders projects create with desired outcome", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: [
              "projects",
              "create",
              "--name",
              "Umzug",
              "--desired-outcome",
              "Alles steht",
            ],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Projekt erstellen")).toBeInTheDocument();
      expect(screen.getByText("Titel: Umzug")).toBeInTheDocument();
      expect(screen.getByText("Ergebnis: Alles steht")).toBeInTheDocument();
    });

    it("renders projects actions create", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: [
              "projects",
              "actions",
              "create",
              "--name",
              "Schlüssel abholen",
            ],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Projektaktion erstellen"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Titel: Schlüssel abholen"),
      ).toBeInTheDocument();
    });

    it("renders projects actions transition", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: [
              "projects",
              "actions",
              "transition",
              "--status",
              "done",
            ],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Status einer Projektaktion ändern"),
      ).toBeInTheDocument();
      expect(screen.getByText("Neuer Status: done")).toBeInTheDocument();
    });

    it("renders projects actions comments add", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["projects", "actions", "comments", "add"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Kommentar zu einer Projektaktion hinzufügen"),
      ).toBeInTheDocument();
    });

    it("renders projects actions comments reply", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["projects", "actions", "comments", "reply"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Antwort auf einen Kommentar hinzufügen"),
      ).toBeInTheDocument();
    });

    it("renders proposals apply", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["proposals", "apply"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Vorschläge übernehmen"),
      ).toBeInTheDocument();
    });

    it("renders generic fallback for unknown CLI command", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: ["unknown", "command"],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Änderung über Senticor Copilot CLI anwenden"),
      ).toBeInTheDocument();
    });

    it("renders intent fallback without kind", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            intent: { schemaVersion: "v0" },
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Copilot-Intent ausführen")).toBeInTheDocument();
      // No details shown when kind is missing
      expect(screen.queryByText(/Intent:/)).not.toBeInTheDocument();
    });

    it("renders fallback when no argv and no intent", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{ type: "copilot_cli" }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Copilot-Intent ausführen")).toBeInTheDocument();
      expect(
        screen.getByText("(kein CLI-Detail angegeben)"),
      ).toBeInTheDocument();
    });

    it("renders update with due date and assignee", () => {
      render(
        <CopilotSuggestionCard
          suggestion={{
            type: "copilot_cli",
            argv: [
              "projects",
              "actions",
              "update",
              "--action",
              "urn:app:action:a1",
              "--due",
              "2025-12-31",
              "--assignee-text",
              "Max Mustermann",
            ],
          }}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Fällig: 2025-12-31")).toBeInTheDocument();
      expect(
        screen.getByText("Verantwortlich: Max Mustermann"),
      ).toBeInTheDocument();
      expect(screen.getByText("Aktion: a1")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders project suggestion without actions or documents", () => {
      const bare: CreateProjectWithActionsSuggestion = {
        type: "create_project_with_actions",
        project: { name: "Leeres Projekt", desiredOutcome: "Nichts" },
        actions: [],
      };
      render(
        <CopilotSuggestionCard
          suggestion={bare}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Leeres Projekt")).toBeInTheDocument();
    });

    it("renders reference suggestion without description", () => {
      const ref: CreateReferenceSuggestion = {
        type: "create_reference",
        name: "Nur Name",
      };
      render(
        <CopilotSuggestionCard
          suggestion={ref}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("Nur Name")).toBeInTheDocument();
    });

    it("renders action with unknown bucket as raw value", () => {
      const action: CreateActionSuggestion = {
        type: "create_action",
        name: "Custom Bucket",
        bucket: "custom_bucket" as unknown as ActionItemBucket,
      };
      render(
        <CopilotSuggestionCard
          suggestion={action}
          status="pending"
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      expect(screen.getByText("custom_bucket")).toBeInTheDocument();
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
