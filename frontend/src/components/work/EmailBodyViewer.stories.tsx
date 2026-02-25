import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { EmailBodyViewer } from "./EmailBodyViewer";

const meta = {
  title: "Work/EmailBodyViewer",
  component: EmailBodyViewer,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof EmailBodyViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HtmlEmail: Story = {
  args: {
    htmlBody: `
      <div style="font-family: Arial, sans-serif;">
        <p>Sehr geehrte Frau Müller,</p>
        <p>hiermit teile ich Ihnen mit, dass der <strong>Antrag auf Verlängerung</strong>
        des Projekts genehmigt wurde.</p>
        <p>Mit freundlichen Grüßen,<br/>Hans Schmidt</p>
      </div>
    `,
    senderName: "Hans Schmidt",
    senderEmail: "h.schmidt@example.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/abc123",
  },
  play: async ({ canvas, userEvent }) => {
    // Initially collapsed
    expect(canvas.queryByText(/Antrag auf Verlängerung/)).toBeNull();
    // Expand
    await userEvent.click(
      canvas.getByRole("button", { name: /E-Mail anzeigen/i }),
    );
    expect(canvas.getByText(/Antrag auf Verlängerung/)).toBeInTheDocument();
    // Gmail link visible
    expect(
      canvas.getByRole("link", { name: /In Gmail öffnen/i }),
    ).toBeInTheDocument();
  },
};

export const PlainTextFallback: Story = {
  args: {
    htmlBody: "",
    textBody:
      "Sehr geehrte Frau Müller,\n\nhiermit teile ich Ihnen mit, dass der Antrag auf Verlängerung des Projekts genehmigt wurde.\n\nMit freundlichen Grüßen,\nHans Schmidt",
    senderName: "Hans Schmidt",
    senderEmail: "h.schmidt@example.de",
  },
};

export const LongBody: Story = {
  args: {
    htmlBody: `
      <div>
        <p>Sehr geehrte Damen und Herren,</p>
        ${Array.from({ length: 20 }, (_, i) => `<p>Absatz ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join("")}
        <p>Mit freundlichen Grüßen</p>
      </div>
    `,
    senderName: "Sekretariat",
    senderEmail: "sekretariat@bund.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/def456",
  },
};

export const NoSender: Story = {
  args: {
    htmlBody: "<p>Eine kurze Nachricht ohne Absenderinfo.</p>",
  },
};

export const WithGermanUmlauts: Story = {
  args: {
    htmlBody:
      "<p>Prüfung des Änderungsantrags für die Übertragung der Zuständigkeit.</p>",
    senderName: "Büro für Öffentlichkeitsarbeit",
    senderEmail: "oeffentlichkeit@bund.de",
  },
};

// Phase 1: Responsive — wide table that would overflow without containment
export const WideTableEmail: Story = {
  args: {
    htmlBody: `
      <div>
        <p>Sehr geehrte Frau Müller,</p>
        <p>anbei finden Sie die Übersicht der eingegangenen Anträge:</p>
        <table style="width: 900px; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="min-width: 150px; border: 1px solid #ccc; padding: 8px;">Antragsnummer</th>
              <th style="min-width: 200px; border: 1px solid #ccc; padding: 8px;">Antragsteller</th>
              <th style="min-width: 150px; border: 1px solid #ccc; padding: 8px;">Datum</th>
              <th style="min-width: 200px; border: 1px solid #ccc; padding: 8px;">Status</th>
              <th style="min-width: 200px; border: 1px solid #ccc; padding: 8px;">Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px;">AZ-2024-001</td>
              <td style="border: 1px solid #ccc; padding: 8px;">Schmidt, Hans</td>
              <td style="border: 1px solid #ccc; padding: 8px;">12.01.2024</td>
              <td style="border: 1px solid #ccc; padding: 8px;">In Bearbeitung</td>
              <td style="border: 1px solid #ccc; padding: 8px;">Unterlagen vollständig</td>
            </tr>
          </tbody>
        </table>
        <p>Mit freundlichen Grüßen</p>
      </div>
    `,
    senderName: "Verwaltung",
    senderEmail: "verwaltung@bund.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/ghi789",
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /E-Mail anzeigen/i }),
    );
    // Table should be present and not cause horizontal overflow
    expect(canvas.getByRole("table")).toBeInTheDocument();
  },
};

// Phase 1: Responsive — mobile viewport
export const MobileViewport: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  args: {
    htmlBody: `
      <div>
        <p>Sehr geehrte Frau Müller,</p>
        <table style="width: 800px;">
          <tr><td style="min-width: 400px;">Spalte 1</td><td style="min-width: 400px;">Spalte 2</td></tr>
        </table>
        <p>Mit freundlichen Grüßen</p>
      </div>
    `,
    senderName: "Verwaltung",
    senderEmail: "verwaltung@bund.de",
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /E-Mail anzeigen/i }),
    );
    expect(canvas.getByRole("table")).toBeInTheDocument();
  },
};

// Phase 2: Copy — shows copy button when expanded
export const WithCopyInteraction: Story = {
  args: {
    htmlBody: `
      <p>Sehr geehrte Frau Müller,</p>
      <p>hiermit teile ich Ihnen mit, dass der Antrag genehmigt wurde.</p>
      <p>Mit freundlichen Grüßen, Hans Schmidt</p>
    `,
    senderName: "Hans Schmidt",
    senderEmail: "h.schmidt@example.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/abc123",
  },
  play: async ({ canvas, userEvent }) => {
    // Copy button not visible when collapsed
    expect(canvas.queryByRole("button", { name: /kopieren/i })).toBeNull();
    // Expand
    await userEvent.click(
      canvas.getByRole("button", { name: /E-Mail anzeigen/i }),
    );
    // Copy button now visible
    expect(
      canvas.getByRole("button", { name: /kopieren/i }),
    ).toBeInTheDocument();
  },
};

// Phase 3: Archive — shows archive button in footer
export const WithArchiveAction: Story = {
  args: {
    htmlBody: `
      <p>Sehr geehrte Frau Müller,</p>
      <p>hiermit teile ich Ihnen mit, dass der Antrag genehmigt wurde.</p>
      <p>Mit freundlichen Grüßen, Hans Schmidt</p>
    `,
    senderName: "Hans Schmidt",
    senderEmail: "h.schmidt@example.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/abc123",
    onArchive: () => undefined,
  },
  play: async ({ canvas, userEvent }) => {
    // Archive button not visible when collapsed
    expect(canvas.queryByRole("button", { name: /archivieren/i })).toBeNull();
    // Expand
    await userEvent.click(
      canvas.getByRole("button", { name: /E-Mail anzeigen/i }),
    );
    // Archive button visible in footer
    expect(
      canvas.getByRole("button", { name: /archivieren/i }),
    ).toBeInTheDocument();
  },
};
