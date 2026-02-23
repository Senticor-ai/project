import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { AppMenu, type AppMenuSection } from "./AppMenu";

const defaultSections: AppMenuSection[] = [
  {
    items: [
      {
        id: "workspace",
        label: "Workspace",
        icon: "dashboard",
        active: true,
        onClick: fn(),
      },
      { id: "settings", label: "Settings", icon: "settings", onClick: fn() },
    ],
  },
  {
    items: [
      { id: "sign-out", label: "Sign out", icon: "logout", onClick: fn() },
    ],
  },
];

const meta = {
  title: "Shell/AppMenu",
  component: AppMenu,
  tags: ["autodocs"],
  args: {
    sections: defaultSections,
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — menu closed
// ---------------------------------------------------------------------------

export const Default: Story = {};

// ---------------------------------------------------------------------------
// Open — click trigger to open
// ---------------------------------------------------------------------------

export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
    await expect(canvas.getByRole("menu")).toBeInTheDocument();
    await expect(canvas.getAllByRole("menuitem")).toHaveLength(3);
  },
};

// ---------------------------------------------------------------------------
// ClickItem — fires callback and closes
// ---------------------------------------------------------------------------

export const ClickItem: Story = {
  args: {
    sections: defaultSections,
  },
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Open menu", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
    });

    await step("Click Settings", async () => {
      await userEvent.click(canvas.getByText("Settings"));
      await expect(args.sections[0]!.items[1]!.onClick).toHaveBeenCalled();
    });

    await step("Menu is closed", async () => {
      await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// EscapeCloses — Escape key closes the dropdown
// ---------------------------------------------------------------------------

export const EscapeCloses: Story = {
  play: async ({ canvas, userEvent, step }) => {
    await step("Open menu", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await expect(canvas.getByRole("menu")).toBeInTheDocument();
    });

    await step("Press Escape", async () => {
      await userEvent.keyboard("{Escape}");
      await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// WithSectionHeaders — sections with labels
// ---------------------------------------------------------------------------

export const WithSectionHeaders: Story = {
  args: {
    sections: [
      {
        label: "Navigation",
        items: [
          {
            id: "workspace",
            label: "Workspace",
            icon: "dashboard",
            onClick: fn(),
          },
          {
            id: "settings",
            label: "Settings",
            icon: "settings",
            onClick: fn(),
          },
        ],
      },
      {
        label: "Account",
        items: [
          { id: "sign-out", label: "Sign out", icon: "logout", onClick: fn() },
        ],
      },
    ],
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Open menu and verify headers", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await expect(canvas.getByText("Navigation")).toBeInTheDocument();
      await expect(canvas.getByText("Account")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// ViewportClampMobile — menu stays fully inside mobile viewport
// ---------------------------------------------------------------------------

export const ViewportClampMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="flex w-full justify-end p-1">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, userEvent, step }) => {
    await step("Open menu near viewport edge", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await expect(canvas.getByRole("menu")).toBeInTheDocument();
    });

    await step("Verify menu is clamped inside viewport", async () => {
      const menu = canvas.getByRole("menu");

      await waitFor(() => {
        expect(menu.style.left).toBeTruthy();
      });

      const rect = menu.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    });
  },
};
