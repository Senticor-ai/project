import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EmailBodyViewer } from "./EmailBodyViewer";

/** Click the expand toggle so body content becomes visible. */
async function expandBody(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
}

describe("EmailBodyViewer", () => {
  it("renders sanitized HTML body", async () => {
    const user = userEvent.setup();
    render(<EmailBodyViewer htmlBody="<p>Hello <strong>World</strong></p>" />);
    await expandBody(user);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("strips script tags (XSS prevention)", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer htmlBody='<p>Safe</p><script>alert("xss")</script>' />,
    );
    await expandBody(user);
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
  });

  it("strips event handlers (XSS prevention)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EmailBodyViewer htmlBody='<p onclick="alert(1)">Click me</p>' />,
    );
    await expandBody(user);
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
    expect(p?.getAttribute("onclick")).toBeNull();
  });

  it("renders plain text fallback when no HTML", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer htmlBody="" textBody="Sehr geehrte Frau Müller..." />,
    );
    await expandBody(user);
    expect(screen.getByText("Sehr geehrte Frau Müller...")).toBeInTheDocument();
  });

  it("prefers HTML over plain text", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer
        htmlBody="<p>HTML version</p>"
        textBody="Plain version"
      />,
    );
    await expandBody(user);
    expect(screen.getByText("HTML version")).toBeInTheDocument();
    expect(screen.queryByText("Plain version")).not.toBeInTheDocument();
  });

  it("shows sender info when provided", () => {
    render(
      <EmailBodyViewer
        htmlBody="<p>Body</p>"
        senderName="Hans Schmidt"
        senderEmail="h.schmidt@example.de"
      />,
    );
    // Sender info is always visible (in header, not collapsed)
    expect(screen.getByText(/Hans Schmidt/)).toBeInTheDocument();
    expect(screen.getByText(/h\.schmidt@example\.de/)).toBeInTheDocument();
  });

  it("renders Gmail link when sourceUrl provided", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer
        htmlBody="<p>Body</p>"
        sourceUrl="https://mail.google.com/mail/u/0/#inbox/123"
      />,
    );
    await expandBody(user);
    const link = screen.getByRole("link", { name: /In Gmail öffnen/i });
    expect(link).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#inbox/123",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render Gmail link when sourceUrl is missing", () => {
    render(<EmailBodyViewer htmlBody="<p>Body</p>" />);
    expect(
      screen.queryByRole("link", { name: /In Gmail öffnen/i }),
    ).not.toBeInTheDocument();
  });

  it("starts collapsed and can be toggled", async () => {
    const user = userEvent.setup();
    render(<EmailBodyViewer htmlBody="<p>Hidden body content</p>" />);

    // Body should be hidden initially
    expect(screen.queryByText("Hidden body content")).not.toBeInTheDocument();

    // Click toggle to expand
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    expect(screen.getByText("Hidden body content")).toBeInTheDocument();

    // Click toggle to collapse
    await user.click(
      screen.getByRole("button", { name: /E-Mail ausblenden/i }),
    );
    expect(screen.queryByText("Hidden body content")).not.toBeInTheDocument();
  });

  it("handles German umlauts correctly", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer htmlBody="<p>Prüfung des Änderungsantrags für Übertragung</p>" />,
    );
    await expandBody(user);
    expect(
      screen.getByText("Prüfung des Änderungsantrags für Übertragung"),
    ).toBeInTheDocument();
  });

  it("renders nothing meaningful when both bodies are empty", () => {
    render(<EmailBodyViewer htmlBody="" textBody="" />);
    // Should still render the toggle button
    expect(
      screen.getByRole("button", { name: /E-Mail anzeigen/i }),
    ).toBeInTheDocument();
  });
});
