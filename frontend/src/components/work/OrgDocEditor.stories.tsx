import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { OrgDocEditor } from "./OrgDocEditor";
import { createOrgDocItem, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const meta = {
  title: "Work/OrgDocEditor",
  component: OrgDocEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrgDocEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const generalDoc = createOrgDocItem({
  name: "Nueva Tierra DE – Allgemein",
  orgDocType: "general",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const userDoc = createOrgDocItem({
  name: "Nueva Tierra DE – Nutzer",
  orgDocType: "user",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const logDoc = createOrgDocItem({
  name: "Nueva Tierra DE – Protokoll",
  orgDocType: "log",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const agentDoc = createOrgDocItem({
  name: "Nueva Tierra DE – Agent",
  orgDocType: "agent",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const GENERAL_CONTENT = `# Nueva Tierra DE

## Kontakt

- Adresse: Musterstraße 1, 10115 Berlin
- E-Mail: info@nueva-tierra.de
- Telefon: +49 30 12345678

## Rechtsform

GmbH i.G.

## Steuer-IDs

- Steuernummer: 123/456/78901
- USt-IdNr: DE123456789`;

const LOG_CONTENT = `# Log — Nueva Tierra DE

---

2026-02-23 09:00 — Organisation erstellt
2026-02-24 14:30 — Steuerberater kontaktiert`;

const AGENT_CONTENT = `# Agent-Notizen — Nueva Tierra DE

## Bekannte Kontakte
- Steuerberater Schmidt (accountant)

## Offene Punkte
- USt-IdNr noch nicht beantragt`;

function makeContentHandler(itemId: string, content: string) {
  // Canonical IDs contain colons which path-to-regexp treats as named params.
  // Escape them so they match as literals.
  const escapedId = itemId.replace(/:/g, "\\:");
  return http.get(`*/items/${escapedId}/content`, () =>
    HttpResponse.json({
      item_id: itemId,
      canonical_id: itemId,
      name: "Doc",
      description: null,
      type: "DigitalDocument",
      bucket: "reference",
      file_content: content,
      file_name: null,
    }),
  );
}

export const GeneralDoc: Story = {
  args: { item: generalDoc },
  parameters: {
    msw: { handlers: [makeContentHandler(generalDoc.id, GENERAL_CONTENT)] },
  },
};

export const UserDoc: Story = {
  args: { item: userDoc },
  parameters: {
    msw: { handlers: [makeContentHandler(userDoc.id, "")] },
  },
};

export const LogDoc: Story = {
  args: { item: logDoc },
  parameters: {
    msw: { handlers: [makeContentHandler(logDoc.id, LOG_CONTENT)] },
  },
};

export const AgentDoc: Story = {
  args: { item: agentDoc },
  parameters: {
    msw: { handlers: [makeContentHandler(agentDoc.id, AGENT_CONTENT)] },
  },
};

export const EmptyAgentDoc: Story = {
  args: { item: agentDoc },
  parameters: {
    msw: { handlers: [makeContentHandler(agentDoc.id, "")] },
  },
};
