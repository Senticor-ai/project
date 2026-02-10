import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { LabelsPanel } from "./LabelsPanel";

const meta = {
  title: "Settings/LabelsPanel",
  component: LabelsPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LabelsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — pre-populated contexts and tags
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    contexts: ["@Buero", "@Telefon", "@Computer", "@Zuhause", "@Unterwegs"],
    tags: ["Dringend", "Vertraulich"],
    onAddContext: () => {},
    onRemoveContext: () => {},
    onAddTag: () => {},
    onRemoveTag: () => {},
  },
};

// ---------------------------------------------------------------------------
// Empty — no contexts or tags
// ---------------------------------------------------------------------------

export const Empty: Story = {
  args: {
    contexts: [],
    tags: [],
    onAddContext: () => {},
    onRemoveContext: () => {},
    onAddTag: () => {},
    onRemoveTag: () => {},
  },
};

// ---------------------------------------------------------------------------
// Interactive — add and remove contexts
// ---------------------------------------------------------------------------

function InteractiveLabels() {
  const [contexts, setContexts] = useState(["@Buero", "@Telefon"]);
  const [tags, setTags] = useState(["Dringend"]);

  return (
    <LabelsPanel
      contexts={contexts}
      tags={tags}
      onAddContext={(name) => {
        if (!contexts.includes(name)) setContexts((prev) => [...prev, name]);
      }}
      onRemoveContext={(name) =>
        setContexts((prev) => prev.filter((c) => c !== name))
      }
      onAddTag={(name) => {
        if (!tags.includes(name)) setTags((prev) => [...prev, name]);
      }}
      onRemoveTag={(name) => setTags((prev) => prev.filter((t) => t !== name))}
    />
  );
}

export const AddRemoveContext: Story = {
  args: {
    contexts: [],
    tags: [],
    onAddContext: () => {},
    onRemoveContext: () => {},
    onAddTag: () => {},
    onRemoveTag: () => {},
  },
  render: () => <InteractiveLabels />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Add a new context", async () => {
      const input = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(input, "@Computer{Enter}");
      await expect(canvas.getByText("@Computer")).toBeInTheDocument();
    });

    await step("Remove @Buero context", async () => {
      await userEvent.click(canvas.getByLabelText("Remove @Buero"));
      const container = canvas.getByText("Context Labels").closest("section")!;
      await expect(
        within(container).queryByText("@Buero"),
      ).not.toBeInTheDocument();
    });

    await step("Add a new tag", async () => {
      const tagInput = canvas.getByPlaceholderText("New tag...");
      await userEvent.type(tagInput, "Vertraulich{Enter}");
      await expect(canvas.getByText("Vertraulich")).toBeInTheDocument();
    });
  },
};
