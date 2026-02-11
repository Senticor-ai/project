import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { AppHeader } from "./AppHeader";

const meta = {
  title: "Shell/AppHeader",
  component: AppHeader,
  tags: ["autodocs"],
  args: {
    username: "wolfgang",
    currentView: "workspace",
    onNavigate: fn(),
    onSignOut: fn(),
    onLogoClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-surface p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — workspace view active
// ---------------------------------------------------------------------------

export const Default: Story = {};

// ---------------------------------------------------------------------------
// InSettingsView — settings view active
// ---------------------------------------------------------------------------

export const InSettingsView: Story = {
  args: {
    currentView: "settings",
  },
};

// ---------------------------------------------------------------------------
// OpenMenuAndNavigate — interactive
// ---------------------------------------------------------------------------

export const OpenMenuAndNavigate: Story = {
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Open menu", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await expect(canvas.getByRole("menu")).toBeInTheDocument();
    });

    await step("Click Settings", async () => {
      await userEvent.click(canvas.getByText("Settings"));
      await expect(args.onNavigate).toHaveBeenCalledWith("settings");
    });
  },
};

// ---------------------------------------------------------------------------
// SignOut — sign out via menu
// ---------------------------------------------------------------------------

export const SignOut: Story = {
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Open menu and sign out", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await userEvent.click(canvas.getByText("Sign out"));
      await expect(args.onSignOut).toHaveBeenCalled();
    });
  },
};

// ---------------------------------------------------------------------------
// WithChatToggle — chat toggle button visible (inactive)
// ---------------------------------------------------------------------------

export const WithChatToggle: Story = {
  args: {
    onToggleChat: fn(),
    isChatOpen: false,
  },
  play: async ({ canvas, step }) => {
    await step("Verify chat toggle button is present", async () => {
      const btn = canvas.getByRole("button", { name: "Chat mit Tay" });
      await expect(btn).toBeInTheDocument();
      await expect(btn).toHaveAttribute("aria-pressed", "false");
    });
  },
};

// ---------------------------------------------------------------------------
// ChatToggleActive — chat toggle button in active state
// ---------------------------------------------------------------------------

export const ChatToggleActive: Story = {
  args: {
    onToggleChat: fn(),
    isChatOpen: true,
  },
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Verify active state", async () => {
      const btn = canvas.getByRole("button", { name: "Chat schließen" });
      await expect(btn).toBeInTheDocument();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    });

    await step("Click calls onToggleChat", async () => {
      const btn = canvas.getByRole("button", { name: "Chat schließen" });
      await userEvent.click(btn);
      await expect(args.onToggleChat).toHaveBeenCalled();
    });
  },
};
