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
  title: "Chat/TaySuggestionCard",
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
      cv: {
        name: "Wolfgang Müller",
        headline: "Senior AI Engineer",
        contact: {
          location: "Berlin, Deutschland",
          email: "wolfgang.mueller@email.com",
          linkedin: "linkedin.com/in/wolfgangmueller",
        },
        summary:
          "Erfahrener Senior AI Engineer mit 8+ Jahren Erfahrung in der Entwicklung und Implementierung von KI-Lösungen.",
        skills: [
          "Python",
          "PyTorch",
          "TensorFlow",
          "Machine Learning",
          "Docker",
          "Kubernetes",
        ],
        experience: [
          {
            title: "Senior AI Engineer",
            company: "Tech Innovations AG",
            period: "2020 - Heute",
            location: "Berlin",
            bullets: [
              "Entwicklung und Deployment von KI-Modellen",
              "Leitung eines 4-köpfigen KI-Teams",
            ],
          },
          {
            title: "AI Engineer",
            company: "DataCorp GmbH",
            period: "2016 - 2020",
            location: "München",
            bullets: [
              "Aufbau der ML-Infrastruktur",
              "NLP-Pipeline für Dokumentenklassifizierung",
            ],
          },
        ],
        certifications: [
          "AWS Certified Machine Learning - Specialty",
          "Google Professional ML Engineer",
        ],
      },
      css: "body { font-family: Inter, sans-serif; }",
      filename: "lebenslauf-angepasst-mueller.pdf",
      projectId: "urn:app:project:abc123" as CanonicalId,
    } satisfies RenderCvSuggestion,
  },
};
