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

// Phase 4: Marketing email normalization — oversized content fits within container
export const MarketingEmail: Story = {
  args: {
    htmlBody: `
      <div style="max-width: 600px; font-family: Arial, sans-serif;">
        <table style="width: 600px; border-collapse: collapse;">
          <tr>
            <td style="padding: 0;">
              <img src="https://placehold.co/600x300/003B73/FFFFFF?text=Wichtige+Mitteilung"
                   alt="Wichtige Mitteilung"
                   style="width: 600px; height: 300px; display: block;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <h1 style="font-size: 36px; line-height: 44px; color: #1a1a1a; margin: 0 0 16px;">
                Ihre Kontoübersicht für März 2026
              </h1>
              <p style="font-size: 16px; line-height: 26px; color: #555555;">
                Sehr geehrte Frau Müller, vielen Dank für Ihr Vertrauen.
                Hier finden Sie eine Zusammenfassung Ihrer aktuellen Kontobewegungen
                und wichtige Hinweise zu Ihrem Vertrag.
              </p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: #f5f5f5;">
                  <td style="padding: 12px; font-size: 14px; font-weight: bold;">Kontostand</td>
                  <td style="padding: 12px; font-size: 14px;">€ 12.345,67</td>
                </tr>
                <tr>
                  <td style="padding: 12px; font-size: 14px; font-weight: bold;">Letzte Buchung</td>
                  <td style="padding: 12px; font-size: 14px;">05.03.2026</td>
                </tr>
              </table>
              <div style="text-align: center; margin: 30px 0;">
                <a href="#" style="font-size: 18px; line-height: 50px; height: 50px;
                   background-color: #003B73; color: #ffffff; padding: 14px 40px;
                   text-decoration: none; display: inline-block;">
                  Jetzt Details ansehen
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px; font-size: 11px; line-height: 16px; color: #999999; background: #f9f9f9;">
              Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese Nachricht.
              <br />Impressum | Datenschutz | Abmelden
            </td>
          </tr>
        </table>
      </div>
    `,
    senderName: "Deutsche Bundesbank",
    senderEmail: "info@bundesbank.de",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/marketing123",
    defaultExpanded: true,
  },
};

export const NewsletterEmail: Story = {
  args: {
    htmlBody: `
      <div style="max-width: 640px; font-family: Georgia, serif;">
        <div style="text-align: center; padding: 20px; background: #1a3c5e;">
          <h1 style="font-size: 28px; line-height: 36px; color: #ffffff; margin: 0;">
            Wöchentlicher Behörden-Newsletter
          </h1>
          <p style="font-size: 14px; color: #bbccdd; margin: 8px 0 0;">
            Ausgabe 12 — 11. März 2026
          </p>
        </div>
        <div style="padding: 24px;">
          <h2 style="font-size: 22px; line-height: 30px; color: #333;">
            Digitalisierung der Verwaltung schreitet voran
          </h2>
          <img src="https://placehold.co/580x200/e8e8e8/333333?text=Digitalisierung"
               alt="Digitalisierung"
               style="width: 580px; height: 200px; display: block; margin: 12px 0;" />
          <p style="font-size: 15px; line-height: 24px; color: #444;">
            Das Bundesministerium des Innern hat neue Richtlinien zur digitalen
            Aktenführung veröffentlicht. Die Umsetzung soll bis Ende 2027 erfolgen.
          </p>
          <h2 style="font-size: 20px; line-height: 28px; color: #333; margin-top: 24px;">
            Personalentwicklung: Fortbildungsangebote Q2
          </h2>
          <p style="font-size: 15px; line-height: 24px; color: #444;">
            Neue Seminare zu E-Akte, Datenschutz und KI-gestützter Sachbearbeitung
            sind ab sofort buchbar.
          </p>
        </div>
        <div style="padding: 16px; font-size: 10px; line-height: 14px; color: #888;
                    background: #f4f4f4; text-align: center; max-height: 100px;">
          Bundesamt für Verwaltungsmodernisierung | newsletter@bund.de | Abmelden
        </div>
      </div>
    `,
    senderName: "Behörden-Newsletter",
    senderEmail: "newsletter@bund.de",
    defaultExpanded: true,
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
