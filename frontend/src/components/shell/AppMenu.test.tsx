import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppMenu, type AppMenuSection } from "./AppMenu";

const sampleSections: AppMenuSection[] = [
  {
    items: [
      {
        id: "workspace",
        label: "Workspace",
        icon: "dashboard",
        onClick: vi.fn(),
      },
      { id: "settings", label: "Settings", icon: "settings", onClick: vi.fn() },
    ],
  },
  {
    items: [
      { id: "sign-out", label: "Sign out", icon: "logout", onClick: vi.fn() },
    ],
  },
];

function freshSections(): AppMenuSection[] {
  return sampleSections.map((s) => ({
    ...s,
    items: s.items.map((i) => ({ ...i, onClick: vi.fn() })),
  }));
}

describe("AppMenu", () => {
  it("renders the trigger button", () => {
    render(<AppMenu sections={sampleSections} />);
    expect(
      screen.getByRole("button", { name: "Main menu" }),
    ).toBeInTheDocument();
  });

  it("menu is hidden by default", () => {
    render(<AppMenu sections={sampleSections} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens menu on trigger click", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("shows all item labels", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("fires item callback on click and closes menu", async () => {
    const user = userEvent.setup();
    const sections = freshSections();
    render(<AppMenu sections={sections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));

    expect(sections[0].items[1].onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes menu on Escape", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("returns focus to trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    const trigger = screen.getByRole("button", { name: "Main menu" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  it("closes menu on click outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <AppMenu sections={sampleSections} />
        <button>Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles menu closed on second trigger click", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    const trigger = screen.getByRole("button", { name: "Main menu" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders section dividers between sections", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppMenu sections={sampleSections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    const dividers = container.querySelectorAll(".border-t");
    expect(dividers.length).toBe(1); // divider between 2 sections
  });

  it("renders section headers when provided", async () => {
    const user = userEvent.setup();
    const sectionsWithLabel: AppMenuSection[] = [
      {
        label: "Navigation",
        items: [{ id: "home", label: "Home", icon: "home", onClick: vi.fn() }],
      },
    ];
    render(<AppMenu sections={sectionsWithLabel} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("applies active styling to active items", async () => {
    const user = userEvent.setup();
    const sections: AppMenuSection[] = [
      {
        items: [
          {
            id: "settings",
            label: "Settings",
            icon: "settings",
            active: true,
            onClick: vi.fn(),
          },
        ],
      },
    ];
    render(<AppMenu sections={sections} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    const item = screen.getByRole("menuitem");
    expect(item.className).toContain("bg-blueprint-50");
  });

  it("sets aria-expanded correctly", async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sampleSections} />);

    const trigger = screen.getByRole("button", { name: "Main menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
