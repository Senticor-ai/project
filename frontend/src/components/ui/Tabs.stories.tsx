import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Tabs } from "./Tabs";

const sampleTabs = [
  { id: "import-export", label: "Import / Export", icon: "swap_horiz" },
  { id: "labels", label: "Labels & Contexts", icon: "label" },
  { id: "preferences", label: "Preferences", icon: "tune" },
];

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — vertical tabs
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    tabs: sampleTabs,
    activeTab: "import-export",
    onSelect: () => {},
  },
  decorators: [
    (Story) => (
      <>
        <Story />
        <div id="tabpanel-import-export" role="tabpanel" />
      </>
    ),
  ],
};

// ---------------------------------------------------------------------------
// Horizontal
// ---------------------------------------------------------------------------

export const Horizontal: Story = {
  args: {
    tabs: sampleTabs,
    activeTab: "labels",
    onSelect: () => {},
    orientation: "horizontal",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 600 }}>
        <Story />
        <div id="tabpanel-labels" role="tabpanel" />
      </div>
    ),
  ],
};

// ---------------------------------------------------------------------------
// Interactive — click through tabs
// ---------------------------------------------------------------------------

function InteractiveTabs() {
  const [active, setActive] = useState("import-export");
  return (
    <div>
      <Tabs tabs={sampleTabs} activeTab={active} onSelect={setActive} />
      <div
        id={`tabpanel-${active}`}
        role="tabpanel"
        className="mt-4 rounded-[var(--radius-md)] border border-border p-4 text-sm text-text-muted"
      >
        Active: {active}
      </div>
    </div>
  );
}

export const Interactive: Story = {
  args: {
    tabs: sampleTabs,
    activeTab: "import-export",
    onSelect: () => {},
  },
  render: () => <InteractiveTabs />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Click Labels tab", async () => {
      await userEvent.click(canvas.getByText("Labels & Contexts"));
      const labelsTab = canvas
        .getByText("Labels & Contexts")
        .closest("button")!;
      await expect(labelsTab).toHaveAttribute("aria-selected", "true");
      await expect(canvas.getByText("Active: labels")).toBeInTheDocument();
    });

    await step("Click Preferences tab", async () => {
      await userEvent.click(canvas.getByText("Preferences"));
      const prefsTab = canvas.getByText("Preferences").closest("button")!;
      await expect(prefsTab).toHaveAttribute("aria-selected", "true");
      await expect(canvas.getByText("Active: preferences")).toBeInTheDocument();
    });
  },
};

/** Mobile viewport — verify touch target sizes. */
export const MobileTouchTargets: StoryObj<typeof meta> = {
  globals: { viewport: { value: "iphone14", isRotated: false } },
  args: {
    tabs: sampleTabs,
    activeTab: "import-export",
    onSelect: () => {},
  },
};
