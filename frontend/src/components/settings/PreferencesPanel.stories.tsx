import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { PreferencesPanel } from "./PreferencesPanel";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/model/settings-types";

const meta = {
  title: "Settings/PreferencesPanel",
  component: PreferencesPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PreferencesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — German defaults
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    preferences: DEFAULT_PREFERENCES,
    onChange: () => {},
  },
};

// ---------------------------------------------------------------------------
// English user
// ---------------------------------------------------------------------------

export const EnglishUser: Story = {
  args: {
    preferences: {
      ...DEFAULT_PREFERENCES,
      language: "en",
      timeFormat: "12h",
      dateFormat: "MM/DD/YYYY",
      weekStart: "sunday",
    },
    onChange: () => {},
  },
};

// ---------------------------------------------------------------------------
// Interactive — change preferences
// ---------------------------------------------------------------------------

function InteractivePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  return (
    <PreferencesPanel
      preferences={prefs}
      onChange={(update) => setPrefs((prev) => ({ ...prev, ...update }))}
    />
  );
}

export const ChangePreferences: Story = {
  render: () => <InteractivePreferences />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Switch to 12h time format", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "12h" }));
      await expect(canvas.getByRole("button", { name: "12h" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    await step("Switch theme to Dark", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Dark" }));
      await expect(
        canvas.getByRole("button", { name: "Dark" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    await step("Enable weekly review", async () => {
      await userEvent.click(canvas.getByLabelText("Weekly review reminder"));
      await expect(canvas.getByLabelText("Review day")).toBeInTheDocument();
    });
  },
};
