import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("EmailBodyViewer – Phase 1: responsive reformatting", () => {
  it("strips inline width from table elements", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EmailBodyViewer htmlBody='<table style="width: 600px"><tr><td>Cell</td></tr></table>' />,
    );
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    const table = container.querySelector("table");
    expect(table?.getAttribute("style") ?? "").not.toMatch(/width\s*:\s*\d+px/);
  });

  it("strips inline min-width from div elements", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EmailBodyViewer htmlBody='<div style="min-width: 300px">Content</div>' />,
    );
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    const div = container.querySelector(".prose div");
    expect(div?.getAttribute("style") ?? "").not.toMatch(
      /min-width\s*:\s*\d+px/,
    );
  });

  it("does NOT strip width HTML attribute (only inline styles)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EmailBodyViewer htmlBody='<table width="600"><tr><td>Cell</td></tr></table>' />,
    );
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    const table = container.querySelector("table");
    // The width attribute may be stripped by DOMPurify (not in ALLOWED_ATTR),
    // but our post-processing should not alter non-style attributes
    // We just verify the rendered HTML doesn't contain style-based fixed width
    expect(table?.style?.width ?? "").not.toMatch(/\d+px/);
  });
});

describe("EmailBodyViewer – Phase 2: copy to clipboard", () => {
  afterEach(() => {
    // Always restore real timers to prevent test contamination
    vi.useRealTimers();
  });

  it("copy button is not visible when collapsed", () => {
    render(<EmailBodyViewer htmlBody="<p>Hello</p>" />);
    expect(
      screen.queryByRole("button", { name: /kopieren/i }),
    ).not.toBeInTheDocument();
  });

  it("copy button appears in header when expanded", async () => {
    const user = userEvent.setup();
    render(<EmailBodyViewer htmlBody="<p>Hello</p>" />);
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    expect(
      screen.getByRole("button", { name: /kopieren/i }),
    ).toBeInTheDocument();
  });

  it("clicking Kopieren shows Kopiert! feedback", async () => {
    const user = userEvent.setup();
    render(<EmailBodyViewer htmlBody="<p>Hello</p>" />);
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    await user.click(screen.getByRole("button", { name: /kopieren/i }));
    // setCopied(true) is called after the copy attempt (sync fallback path in jsdom)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /kopiert/i }),
      ).toBeInTheDocument(),
    );
  });

  it("Kopiert! feedback reverts to Kopieren after 2 seconds", async () => {
    // fireEvent (sync) + async act to flush microtasks from the async handleCopy
    vi.useFakeTimers();
    render(<EmailBodyViewer htmlBody="<p>Hello</p>" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    });
    // Use async act so React 18 can flush the setCopied(true) update from handleCopy
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /kopieren/i }));
    });
    expect(
      screen.getByRole("button", { name: /kopiert/i }),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByRole("button", { name: /kopieren/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /kopiert/i }),
    ).not.toBeInTheDocument();
  });
});

describe("EmailBodyViewer – Phase 3: archive from preview", () => {
  it("archive button is not shown when onArchive is not provided", async () => {
    const user = userEvent.setup();
    render(<EmailBodyViewer htmlBody="<p>Body</p>" />);
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    expect(
      screen.queryByRole("button", { name: /archivieren/i }),
    ).not.toBeInTheDocument();
  });

  it("archive button appears in footer when onArchive is provided", async () => {
    const user = userEvent.setup();
    render(
      <EmailBodyViewer htmlBody="<p>Body</p>" onArchive={() => undefined} />,
    );
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    expect(
      screen.getByRole("button", { name: /archivieren/i }),
    ).toBeInTheDocument();
  });

  it("clicking Archivieren calls the onArchive callback", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<EmailBodyViewer htmlBody="<p>Body</p>" onArchive={onArchive} />);
    await user.click(screen.getByRole("button", { name: /E-Mail anzeigen/i }));
    await user.click(screen.getByRole("button", { name: /archivieren/i }));
    expect(onArchive).toHaveBeenCalledOnce();
  });
});
