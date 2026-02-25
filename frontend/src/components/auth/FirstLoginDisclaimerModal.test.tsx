import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirstLoginDisclaimerModal } from "./FirstLoginDisclaimerModal";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const mockOnAcknowledge = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(isOpen: boolean) {
  return render(
    <FirstLoginDisclaimerModal
      isOpen={isOpen}
      onAcknowledge={mockOnAcknowledge}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FirstLoginDisclaimerModal", () => {
  it("renders nothing when isOpen is false", () => {
    renderModal(false);
    expect(
      screen.queryByRole("dialog", { name: /entwicklungs-/i }),
    ).not.toBeInTheDocument();
  });

  it("renders modal when isOpen is true", () => {
    renderModal(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders modal with correct accessibility attributes", () => {
    renderModal(true);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "disclaimer-title");
  });

  it("renders warning icon", () => {
    renderModal(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Warning icon is rendered via Icon component as a span with "warning" text
    const iconElement = document.querySelector(
      'span[aria-hidden="true"].material-symbols-outlined',
    );
    expect(iconElement).toBeInTheDocument();
    expect(iconElement?.textContent).toBe("warning");
  });

  it("renders title from i18n", () => {
    renderModal(true);
    expect(
      screen.getByText(/important notice.*dev.*demo/i),
    ).toBeInTheDocument();
  });

  it("renders intro text from i18n", () => {
    renderModal(true);
    expect(screen.getByText(/before you continue/i)).toBeInTheDocument();
  });

  it("renders all four disclaimer points", () => {
    renderModal(true);
    expect(
      screen.getByText(/development and demonstration purposes only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no service level agreements.*SLA.*warranties/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no backup guarantees.*data may be lost at any time/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no data privacy guarantees.*do not use real or sensitive data/i),
    ).toBeInTheDocument();
  });

  it("renders acknowledge button with correct text", () => {
    renderModal(true);
    expect(
      screen.getByRole("button", { name: /i understand/i }),
    ).toBeInTheDocument();
  });

  it("calls onAcknowledge when button is clicked", async () => {
    const user = userEvent.setup();
    renderModal(true);

    const button = screen.getByRole("button", { name: /i understand/i });
    await user.click(button);

    expect(mockOnAcknowledge).toHaveBeenCalledTimes(1);
  });

  it("does not call onAcknowledge when modal is closed", () => {
    renderModal(false);
    expect(mockOnAcknowledge).not.toHaveBeenCalled();
  });

  it("renders backdrop with correct aria-hidden", () => {
    renderModal(true);
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeInTheDocument();
  });
});
