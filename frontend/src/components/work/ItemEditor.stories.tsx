import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ItemEditor } from "./ItemEditor";
import type { ItemEditableFields } from "@/model/types";
import { createProject, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const defaults: ItemEditableFields = {
  contexts: [],
  tags: [],
};

const withNotes: ItemEditableFields = {
  contexts: ["@phone", "@office"],
  tags: [],
  description:
    "Discussed in last team meeting.\nFollow up with HR before Friday.",
  energyLevel: "medium",
  scheduledDate: "2026-03-01",
};

const sampleProjects = [
  createProject({ name: "Website Redesign", desiredOutcome: "New site live" }),
  createProject({
    name: "Q1 Planning",
    desiredOutcome: "Q1 goals defined",
  }),
];

const meta = {
  title: "Work/ItemEditor",
  component: ItemEditor,
  tags: ["autodocs"],
  args: {
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ItemEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty editor — all fields at defaults. */
export const Default: Story = {
  args: { values: defaults },
};

/** Pre-filled with multiline notes, contexts, complexity, and date. */
export const WithNotes: Story = {
  args: { values: withNotes },
};

/** With project dropdown. */
export const WithProjects: Story = {
  args: { values: defaults, projects: sampleProjects },
};

/** Type multiline notes (Enter inserts newline, not submit). */
export const MultilineNotes: Story = {
  args: { values: defaults },
  play: async ({ canvas, userEvent }) => {
    const textarea = canvas.getByLabelText("Notes");
    await userEvent.click(textarea);
    await userEvent.type(textarea, "Line one{Enter}Line two{Enter}Line three");
    await expect(textarea).toHaveValue("Line one\nLine two\nLine three");
  },
};

/** Select a complexity level. */
export const SelectComplexity: Story = {
  args: { values: defaults },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "high" }));
    await expect(args.onChange).toHaveBeenCalledWith({ energyLevel: "high" });
  },
};

/** Add a context label. */
export const AddContext: Story = {
  args: { values: defaults },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByPlaceholderText("@Büro, @Telefon...");
    await userEvent.type(input, "@errands{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith({
      contexts: ["@errands"],
    });
  },
};

/** Pre-filled with tags (IRS document types). */
export const WithTags: Story = {
  args: {
    values: { ...defaults, tags: ["1099-int", "schedule-b"] },
  },
};

/** Add a tag via Enter key. */
export const AddTag: Story = {
  args: { values: defaults },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByPlaceholderText("Steuerrecht, Eilig...");
    await userEvent.type(input, "w-2{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith({ tags: ["w-2"] });
  },
};
