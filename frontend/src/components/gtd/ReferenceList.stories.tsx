import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ReferenceList } from "./ReferenceList";
import type { ReferenceMaterial } from "@/model/gtd-types";
import {
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const sampleRefs: ReferenceMaterial[] = [
  createReferenceMaterial({
    title: "Company style guide",
    origin: "captured",
    contentType: "application/pdf",
    provenance: {
      createdAt: "2025-06-15T10:00:00Z",
      updatedAt: "2025-06-15T10:00:00Z",
      history: [{ timestamp: "2025-06-15T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    title: "Meeting notes from standup",
    origin: "triaged",
    notes: "Key decisions captured during standup.",
    provenance: {
      createdAt: "2025-05-20T10:00:00Z",
      updatedAt: "2025-05-20T10:00:00Z",
      history: [{ timestamp: "2025-05-20T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    title: "Invoice Q4-2025.pdf",
    origin: "file",
    contentType: "application/pdf",
    provenance: {
      createdAt: "2025-04-10T10:00:00Z",
      updatedAt: "2025-04-10T10:00:00Z",
      history: [{ timestamp: "2025-04-10T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    title: "React documentation",
    origin: "captured",
    externalUrl: "https://react.dev",
    provenance: {
      createdAt: "2025-03-01T10:00:00Z",
      updatedAt: "2025-03-01T10:00:00Z",
      history: [{ timestamp: "2025-03-01T10:00:00Z", action: "created" }],
    },
  }),
];

const meta = {
  title: "GTD/ReferenceList",
  component: ReferenceList,
  tags: ["autodocs"],
  args: {
    onAdd: fn(),
    onArchive: fn(),
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReferenceList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { references: sampleRefs },
};

export const Empty: Story = {
  args: { references: [] },
};

export const SingleItem: Story = {
  args: {
    references: [
      createReferenceMaterial({
        title: "Sole reference item",
        origin: "captured",
      }),
    ],
  },
};

export const MixedOrigins: Story = {
  args: { references: sampleRefs },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Type into rapid entry and press Enter to add a reference. */
export const RapidEntry: Story = {
  args: { references: [] },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Rapid entry");
    await userEvent.type(input, "New reference material{Enter}");
    await expect(args.onAdd).toHaveBeenCalledWith("New reference material");
  },
};

/** Archive a reference item — it disappears from the list. */
export const ArchiveFromList: Story = {
  render: function ArchiveDemo() {
    const [refs, setRefs] = useState<ReferenceMaterial[]>([
      createReferenceMaterial({ title: "Ref to archive" }),
      createReferenceMaterial({ title: "Ref to keep" }),
    ]);

    return (
      <ReferenceList
        references={refs}
        onAdd={fn()}
        onArchive={(id) => {
          setRefs((prev) =>
            prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    provenance: {
                      ...r.provenance,
                      archivedAt: new Date().toISOString(),
                    },
                  }
                : r,
            ),
          );
        }}
        onSelect={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("2 references")).toBeInTheDocument();

    await step("Archive first reference", async () => {
      await userEvent.click(
        canvas.getByLabelText("Actions for Ref to archive"),
      );
      await userEvent.click(canvas.getByText("Archive"));
    });

    await expect(canvas.getByText("1 reference")).toBeInTheDocument();
    await expect(canvas.queryByText("Ref to archive")).not.toBeInTheDocument();
    await expect(canvas.getByText("Ref to keep")).toBeInTheDocument();
  },
};
