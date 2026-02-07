import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxTriage } from "./InboxTriage";
import { createProject } from "@/model/factories";

describe("InboxTriage", () => {
  it("renders all bucket buttons", () => {
    render(<InboxTriage onTriage={vi.fn()} />);
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Waiting")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Calendar")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Someday")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Archive")).toBeInTheDocument();
  });

  it("calls onTriage with correct bucket when Next is clicked", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);
    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "next" });
  });

  it("calls onTriage with correct bucket when Waiting is clicked", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);
    await user.click(screen.getByLabelText("Move to Waiting"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "waiting" });
  });

  it("calls onTriage with correct bucket when Calendar is clicked", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);
    await user.click(screen.getByLabelText("Move to Calendar"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "calendar" });
  });

  it("calls onTriage with archive when Archive is clicked", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);
    await user.click(screen.getByLabelText("Archive"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "archive" });
  });

  it("shows expanded options when More options is clicked", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);
    expect(screen.queryByText("Date")).not.toBeInTheDocument();
    await user.click(screen.getByText("More options"));
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Labels / contexts")).toBeInTheDocument();
  });

  it("hides expanded options when Less options is clicked", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);
    await user.click(screen.getByText("More options"));
    expect(screen.getByText("Date")).toBeInTheDocument();
    await user.click(screen.getByText("Less options"));
    // AnimatePresence exit animation — wait for removal
    await waitFor(() => {
      expect(screen.queryByText("Date")).not.toBeInTheDocument();
    });
  });

  it("shows project dropdown when projects are provided", async () => {
    const user = userEvent.setup();
    const projects = [
      createProject({
        title: "Website Redesign",
        desiredOutcome: "New site live",
      }),
    ];
    render(<InboxTriage onTriage={vi.fn()} projects={projects} />);
    await user.click(screen.getByText("More options"));
    expect(screen.getByText("Assign to project")).toBeInTheDocument();
    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
  });

  it("does not show project dropdown when no projects", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);
    await user.click(screen.getByText("More options"));
    expect(screen.queryByText("Assign to project")).not.toBeInTheDocument();
  });

  it("includes project in triage result when selected", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    const project = createProject({
      title: "Website Redesign",
      desiredOutcome: "New site live",
    });
    render(<InboxTriage onTriage={onTriage} projects={[project]} />);

    // Expand options and select project
    await user.click(screen.getByText("More options"));
    await user.selectOptions(screen.getByRole("combobox"), project.id);

    // Click a bucket
    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({
      targetBucket: "next",
      projectId: project.id,
    });
  });

  it("includes date in triage result when set", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);

    await user.click(screen.getByText("More options"));
    // Use the date input specifically (type="date")
    const dateInput = document.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    // fireEvent is needed for date inputs in jsdom
    await user.clear(dateInput);
    await user.type(dateInput, "2026-02-10");

    await user.click(screen.getByLabelText("Move to Calendar"));
    expect(onTriage).toHaveBeenCalledWith({
      targetBucket: "calendar",
      date: "2026-02-10",
    });
  });

  it("allows adding context labels", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);

    await user.click(screen.getByText("More options"));
    const contextInput = screen.getByPlaceholderText("@phone, @office...");
    await user.type(contextInput, "@phone");
    await user.click(screen.getByText("Add"));

    expect(screen.getByText("@phone")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({
      targetBucket: "next",
      contexts: ["@phone"],
    });
  });

  it("allows removing context labels", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);

    await user.click(screen.getByText("More options"));
    const contextInput = screen.getByPlaceholderText("@phone, @office...");
    await user.type(contextInput, "@phone");
    await user.click(screen.getByText("Add"));

    expect(screen.getByText("@phone")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Remove @phone"));
    expect(screen.queryByText("@phone")).not.toBeInTheDocument();
  });

  it("adds context on Enter key", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);

    await user.click(screen.getByText("More options"));
    const contextInput = screen.getByPlaceholderText("@phone, @office...");
    await user.type(contextInput, "@office{Enter}");

    expect(screen.getByText("@office")).toBeInTheDocument();
  });

  it("clears project from triage result when deselected", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    const project = createProject({
      title: "Website Redesign",
      desiredOutcome: "New site live",
    });
    render(<InboxTriage onTriage={onTriage} projects={[project]} />);

    // Expand, select project, then deselect
    await user.click(screen.getByText("More options"));
    await user.selectOptions(screen.getByRole("combobox"), project.id);
    await user.selectOptions(screen.getByRole("combobox"), "");

    // Triage without project
    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "next" });
  });

  it("shows complexity selector in expanded options", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);
    await user.click(screen.getByText("More options"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("includes energyLevel in triage result when set", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);

    await user.click(screen.getByText("More options"));
    await user.click(screen.getByText("high"));

    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({
      targetBucket: "next",
      energyLevel: "high",
    });
  });

  it("toggles complexity off when clicked again", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(<InboxTriage onTriage={onTriage} />);

    await user.click(screen.getByText("More options"));
    await user.click(screen.getByText("medium"));
    await user.click(screen.getByText("medium")); // deselect

    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledWith({ targetBucket: "next" });
  });

  it("prevents duplicate contexts", async () => {
    const user = userEvent.setup();
    render(<InboxTriage onTriage={vi.fn()} />);

    await user.click(screen.getByText("More options"));
    const contextInput = screen.getByPlaceholderText("@phone, @office...");
    await user.type(contextInput, "@phone{Enter}");
    await user.type(contextInput, "@phone{Enter}");

    // Should only show one @phone chip
    const chips = screen.getAllByText("@phone");
    expect(chips).toHaveLength(1);
  });
});
