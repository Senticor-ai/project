import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { SettingsScreen } from "./SettingsScreen";

const meta = {
  title: "Screens/Settings",
  component: SettingsScreen,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ minHeight: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — Import/Export tab active
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {},
};

// ---------------------------------------------------------------------------
// Labels tab
// ---------------------------------------------------------------------------

export const LabelsTab: Story = {
  args: {
    initialTab: "labels",
  },
};

// ---------------------------------------------------------------------------
// Preferences tab
// ---------------------------------------------------------------------------

export const PreferencesTab: Story = {
  args: {
    initialTab: "preferences",
  },
};

// ---------------------------------------------------------------------------
// Developer tab
// ---------------------------------------------------------------------------

export const DeveloperTab: Story = {
  args: {
    initialTab: "developer",
  },
};

// ---------------------------------------------------------------------------
// Interactive — navigate through all tabs
// ---------------------------------------------------------------------------

export const NavigateTabs: Story = {
  args: {},
  play: async ({ canvas, userEvent, step }) => {
    await step("Verify Import/Export is shown initially", async () => {
      const main = canvas.getByRole("main", { name: "Settings content" });
      await expect(
        within(main).getByRole("button", { name: "Import from Nirvana" }),
      ).toBeInTheDocument();
    });

    await step("Switch to Labels & Contexts", async () => {
      await userEvent.click(canvas.getByText("Labels & Contexts"));
      const labelsTab = canvas
        .getByText("Labels & Contexts")
        .closest("button")!;
      await expect(labelsTab).toHaveAttribute("aria-selected", "true");
      const main = canvas.getByRole("main", { name: "Settings content" });
      await expect(
        within(main).getByText("Context Labels"),
      ).toBeInTheDocument();
    });

    await step("Switch to Preferences", async () => {
      await userEvent.click(canvas.getByText("Preferences"));
      const prefsTab = canvas.getByText("Preferences").closest("button")!;
      await expect(prefsTab).toHaveAttribute("aria-selected", "true");
      const main = canvas.getByRole("main", { name: "Settings content" });
      await expect(
        within(main).getByText("Language & Regional"),
      ).toBeInTheDocument();
    });

    await step("Switch back to Import / Export", async () => {
      await userEvent.click(canvas.getByText("Import / Export"));
      const ieTab = canvas.getByText("Import / Export").closest("button")!;
      await expect(ieTab).toHaveAttribute("aria-selected", "true");
    });
  },
};
