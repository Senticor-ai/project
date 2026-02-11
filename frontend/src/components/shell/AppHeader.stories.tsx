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
