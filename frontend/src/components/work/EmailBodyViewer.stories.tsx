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
