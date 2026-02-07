import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentChip } from "./AttachmentChip";

describe("AttachmentChip", () => {
  it("renders reference type and target title", () => {
    render(
      <AttachmentChip referenceType="blocks" targetTitle="Get approval" />,
    );
    expect(screen.getByText("Get approval")).toBeInTheDocument();
  });

  it("shows detach button when onDetach provided", () => {
    render(
      <AttachmentChip
        referenceType="depends_on"
        targetTitle="Pass tests"
        onDetach={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /detach pass tests/i }),
    ).toBeInTheDocument();
  });

  it("does not show detach button when onDetach is undefined", () => {
    render(<AttachmentChip referenceType="refers_to" targetTitle="Some doc" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onDetach when clicked", async () => {
    const user = userEvent.setup();
    const onDetach = vi.fn();
    render(
      <AttachmentChip
        referenceType="blocks"
        targetTitle="Target"
        onDetach={onDetach}
      />,
    );
    await user.click(screen.getByRole("button", { name: /detach target/i }));
    expect(onDetach).toHaveBeenCalledOnce();
  });

  it("renders all reference types", () => {
    const types = [
      "blocks",
      "depends_on",
      "delegates_to",
      "refers_to",
      "context_of",
      "part_of",
      "follows",
      "waiting_on",
    ] as const;
    for (const type of types) {
      const { unmount } = render(
        <AttachmentChip referenceType={type} targetTitle={`Test ${type}`} />,
      );
      unmount();
    }
  });
});
