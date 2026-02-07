import { describe, it, expect } from "vitest";
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
});
