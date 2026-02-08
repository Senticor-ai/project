import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsScreen } from "./SettingsScreen";

describe("SettingsScreen", () => {
  it("renders with Import / Export tab active by default", () => {
    render(<SettingsScreen />);
    // ImportExportPanel has Import and Export section headings
    expect(
      screen.getByRole("button", { name: "Import from Nirvana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export as JSON" }),
    ).toBeInTheDocument();
    // Verify tab is selected
    const tab = screen.getByText("Import / Export").closest("button")!;
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("renders all three tab labels", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Import / Export")).toBeInTheDocument();
    expect(screen.getByText("Labels & Contexts")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });

  it("switches to Labels tab when clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText("Labels & Contexts"));

    const labelsTab = screen.getByText("Labels & Contexts").closest("button")!;
    expect(labelsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Context Labels")).toBeInTheDocument();
  });

  it("switches to Preferences tab when clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText("Preferences"));

    const prefsTab = screen.getByText("Preferences").closest("button")!;
    expect(prefsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Language & Regional")).toBeInTheDocument();
  });

  it("renders with initialTab=labels", () => {
    render(<SettingsScreen initialTab="labels" />);
    const labelsTab = screen.getByText("Labels & Contexts").closest("button")!;
    expect(labelsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Context Labels")).toBeInTheDocument();
  });

  it("renders with initialTab=preferences", () => {
    render(<SettingsScreen initialTab="preferences" />);
    const prefsTab = screen.getByText("Preferences").closest("button")!;
    expect(prefsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Language & Regional")).toBeInTheDocument();
  });

  it("switches to Developer tab when clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByText("Developer"));

    const devTab = screen.getByText("Developer").closest("button")!;
    expect(devTab).toHaveAttribute("aria-selected", "true");
  });

  it("works in controlled mode with activeTab and onTabChange", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsScreen activeTab="labels" onTabChange={onTabChange} />);

    expect(screen.getByText("Context Labels")).toBeInTheDocument();

    await user.click(screen.getByText("Developer"));
    expect(onTabChange).toHaveBeenCalledWith("developer");
  });

  it("renders all four tab labels including Developer", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Import / Export")).toBeInTheDocument();
    expect(screen.getByText("Labels & Contexts")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
  });

  it("can add and remove contexts in the Labels tab", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen initialTab="labels" />);

    expect(screen.getByText("@Buero")).toBeInTheDocument();

    const contextInput = screen.getByPlaceholderText("@phone, @office...");
    await user.type(contextInput, "@Draussen");
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    await user.click(addButtons[0]);
    expect(screen.getByText("@Draussen")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove @Buero" }));
    expect(screen.queryByText("@Buero")).not.toBeInTheDocument();
  });

  it("can add and remove tags in the Labels tab", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen initialTab="labels" />);

    const tagInput = screen.getByPlaceholderText("New tag...");
    await user.type(tagInput, "urgent");
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    await user.click(addButtons[1]);
    expect(screen.getByText("urgent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove urgent" }));
    expect(screen.queryByText("urgent")).not.toBeInTheDocument();
  });
});
