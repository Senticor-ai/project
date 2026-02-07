import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ObjectCard } from "./ObjectCard";
import { createCanonicalId } from "@/model/canonical-id";

describe("ObjectCard", () => {
  it("renders title and bucket badge", () => {
    render(
      <ObjectCard
        title="Anruf bei Frau Müller"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
      />,
    );
    expect(screen.getByText("Anruf bei Frau Müller")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <ObjectCard
        title="Deploy"
        subtitle="Projekt: Relaunch"
        bucket="next"
        confidence="high"
        needsEnrichment={false}
      />,
    );
    expect(screen.getByText("Projekt: Relaunch")).toBeInTheDocument();
  });

  it("renders attachments", () => {
    render(
      <ObjectCard
        title="Deploy"
        bucket="next"
        confidence="high"
        needsEnrichment={false}
        attachments={[
          {
            type: "blocks",
            targetId: createCanonicalId("action", "t1"),
            targetTitle: "Production release",
            createdAt: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText("Production release")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ObjectCard
        title="Test"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText("Test"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("calls onSelect on Enter key", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ObjectCard
        title="Keyboard test"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
        onSelect={onSelect}
      />,
    );
    const card = screen
      .getByText("Keyboard test")
      .closest("[role='button']") as HTMLElement;
    card.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("applies focus ring when isFocused is true", () => {
    const { container } = render(
      <ObjectCard
        title="Focused item"
        bucket="next"
        confidence="high"
        needsEnrichment={false}
        isFocused={true}
      />,
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain("ring-2");
  });

  it("renders children in the slot", () => {
    render(
      <ObjectCard
        title="Test"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
      >
        <span data-testid="custom-child">Extra content</span>
      </ObjectCard>,
    );
    expect(screen.getByTestId("custom-child")).toBeInTheDocument();
  });

  it("calls onDetachReference when detach button is clicked", async () => {
    const user = userEvent.setup();
    const onDetach = vi.fn();
    const targetId = createCanonicalId("action", "t1");
    render(
      <ObjectCard
        title="Card with detach"
        bucket="next"
        confidence="high"
        needsEnrichment={false}
        attachments={[
          {
            type: "blocks",
            targetId,
            targetTitle: "Blocking task",
            createdAt: new Date().toISOString(),
          },
        ]}
        onDetachReference={onDetach}
      />,
    );
    await user.click(screen.getByLabelText("Detach Blocking task"));
    expect(onDetach).toHaveBeenCalledWith(targetId);
  });

  it("does not render detach button when onDetachReference is not provided", () => {
    render(
      <ObjectCard
        title="No detach"
        bucket="next"
        confidence="high"
        needsEnrichment={false}
        attachments={[
          {
            type: "blocks",
            targetId: createCanonicalId("action", "t1"),
            targetTitle: "Some task",
            createdAt: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText("Detach Some task")).not.toBeInTheDocument();
  });

  it("removes role and tabIndex when interactive is false", () => {
    const { container } = render(
      <ObjectCard
        title="Non-interactive card"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
        interactive={false}
      />,
    );
    const card = container.firstElementChild;
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("calls onSelect on Space key", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ObjectCard
        title="Space test"
        bucket="inbox"
        confidence="low"
        needsEnrichment={true}
        onSelect={onSelect}
      />,
    );
    const card = screen
      .getByText("Space test")
      .closest("[role='button']") as HTMLElement;
    card.focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
