import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";

const defaults = {
  username: "testuser",
  currentView: "workspace" as const,
  onNavigate: vi.fn(),
  onSignOut: vi.fn(),
};

describe("AppHeader", () => {
  it("renders logo, title, and username", () => {
    render(<AppHeader {...defaults} />);
    expect(screen.getByText("terminandoyo")).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByAltText("TAY")).toBeInTheDocument();
  });

  it("renders hamburger menu trigger", () => {
    render(<AppHeader {...defaults} />);
    expect(
      screen.getByRole("button", { name: "Main menu" }),
    ).toBeInTheDocument();
  });

  it("does not render a standalone Import button", () => {
    render(<AppHeader {...defaults} />);
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
  });

  it("does not render a standalone Sign out button in the header bar", () => {
    render(<AppHeader {...defaults} />);
    // Sign out is inside the menu, not visible until menu is opened
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("fires onNavigate('settings') when Settings is clicked in menu", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onNavigate={onNavigate} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("fires onNavigate('workspace') when Workspace is clicked in menu", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <AppHeader
        {...defaults}
        currentView="settings"
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Workspace"));

    expect(onNavigate).toHaveBeenCalledWith("workspace");
  });

  it("fires onSignOut when Sign out is clicked in menu", async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onSignOut={onSignOut} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Sign out"));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("marks current view as active in menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader {...defaults} currentView="settings" />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    const settingsItem = screen.getByText("Settings").closest("button");
    expect(settingsItem?.className).toContain("bg-blueprint-50");

    const workspaceItem = screen.getByText("Workspace").closest("button");
    expect(workspaceItem?.className).not.toContain("bg-blueprint-50");
  });
});
