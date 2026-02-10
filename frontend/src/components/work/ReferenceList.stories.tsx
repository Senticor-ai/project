import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ReferenceList } from "./ReferenceList";
import type { ReferenceMaterial } from "@/model/types";
import {
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const sampleRefs: ReferenceMaterial[] = [
  createReferenceMaterial({
    name: "Company style guide",
    origin: "captured",
    encodingFormat: "application/pdf",
    provenance: {
      createdAt: "2025-06-15T10:00:00Z",
      updatedAt: "2025-06-15T10:00:00Z",
      history: [{ timestamp: "2025-06-15T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    name: "Meeting notes from standup",
    origin: "triaged",
    description: "Key decisions captured during standup.",
    provenance: {
      createdAt: "2025-05-20T10:00:00Z",
      updatedAt: "2025-05-20T10:00:00Z",
      history: [{ timestamp: "2025-05-20T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    name: "Invoice Q4-2025.pdf",
    origin: "file",
    encodingFormat: "application/pdf",
    provenance: {
      createdAt: "2025-04-10T10:00:00Z",
      updatedAt: "2025-04-10T10:00:00Z",
      history: [{ timestamp: "2025-04-10T10:00:00Z", action: "created" }],
    },
  }),
  createReferenceMaterial({
    name: "React documentation",
    origin: "captured",
    url: "https://react.dev",
    provenance: {
      createdAt: "2025-03-01T10:00:00Z",
      updatedAt: "2025-03-01T10:00:00Z",
      history: [{ timestamp: "2025-03-01T10:00:00Z", action: "created" }],
    },
  }),
];

const meta = {
  title: "Work/ReferenceList",
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
        name: "Sole reference item",
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

/** Toggle archived references visible/hidden. */
export const ToggleArchivedInteractive: Story = {
  render: function ToggleArchived() {
    const [refs] = useState<ReferenceMaterial[]>([
      createReferenceMaterial({ name: "Active ref one" }),
      createReferenceMaterial({ name: "Active ref two" }),
      createReferenceMaterial({
        name: "Archived ref one",
        provenance: {
          createdAt: "2025-04-01T10:00:00Z",
          updatedAt: "2025-04-01T10:00:00Z",
          archivedAt: "2025-06-01T10:00:00Z",
          history: [{ timestamp: "2025-04-01T10:00:00Z", action: "created" }],
        },
      }),
      createReferenceMaterial({
        name: "Archived ref two",
        provenance: {
          createdAt: "2025-03-01T10:00:00Z",
          updatedAt: "2025-03-01T10:00:00Z",
          archivedAt: "2025-05-15T10:00:00Z",
          history: [{ timestamp: "2025-03-01T10:00:00Z", action: "created" }],
        },
      }),
    ]);

    return (
      <ReferenceList
        references={refs}
        onAdd={fn()}
        onArchive={fn()}
        onSelect={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    // Default: archived items hidden
    await expect(canvas.getByText("Active ref one")).toBeInTheDocument();
    await expect(canvas.getByText("Active ref two")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Archived ref one"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText("Archived ref two"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("2 references")).toBeInTheDocument();

    await step("Show archived", async () => {
      await userEvent.click(canvas.getByLabelText("Expand Archived"));
    });

    // Archived items now visible
    await expect(canvas.getByText("Archived ref one")).toBeInTheDocument();
    await expect(canvas.getByText("Archived ref two")).toBeInTheDocument();

    await step("Hide archived", async () => {
      await userEvent.click(canvas.getByLabelText("Collapse Archived"));
    });

    // Back to hidden
    await expect(
      canvas.queryByText("Archived ref one"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText("Archived ref two"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("2 references")).toBeInTheDocument();
  },
};

/** Archive a reference item — it disappears from the list. */
export const ArchiveFromList: Story = {
  render: function ArchiveDemo() {
    const [refs, setRefs] = useState<ReferenceMaterial[]>([
      createReferenceMaterial({ name: "Ref to archive" }),
      createReferenceMaterial({ name: "Ref to keep" }),
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
