import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaySuggestionCard } from "./TaySuggestionCard";
import type {
  CreateProjectWithActionsSuggestion,
  CreateActionSuggestion,
  CreateReferenceSuggestion,
  RenderCvSuggestion,
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
    { name: "Essen & Getränke organisieren", bucket: "next" },
    { name: "Dekoration besorgen", bucket: "next" },
  ],
  documents: [{ name: "Einladungsvorlage" }],
};

const meta = {
  title: "Chat/CopilotSuggestionCard",
  component: TaySuggestionCard,
  args: {
    suggestion: projectSuggestion,
    status: "pending",
    onAccept: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof TaySuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectPending: Story = {};

export const ProjectAccepted: Story = {
  args: { status: "accepted" },
};

export const ProjectDismissed: Story = {
  args: { status: "dismissed" },
};

export const ProjectWithoutDocuments: Story = {
  args: {
    suggestion: {
      ...projectSuggestion,
      documents: undefined,
    },
  },
};

export const SingleAction: Story = {
  args: {
    suggestion: {
      type: "create_action",
      name: "Milch kaufen",
      bucket: "next",
    } satisfies CreateActionSuggestion,
  },
};

export const Reference: Story = {
  args: {
    suggestion: {
      type: "create_reference",
      name: "Rezeptsammlung",
      description: "Lieblingsrezepte für die Geburtstagsfeier",
    } satisfies CreateReferenceSuggestion,
  },
};

export const RenderCv: Story = {
  args: {
    suggestion: {
      type: "render_cv",
      sourceItemId: "urn:app:reference:md-cv-1" as CanonicalId,
      css: "body { font-family: Inter, sans-serif; }",
      filename: "lebenslauf-angepasst-mueller.pdf",
      projectId: "urn:app:project:abc123" as CanonicalId,
    } satisfies RenderCvSuggestion,
  },
};
