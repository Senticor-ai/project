import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ReferenceRow } from "./ReferenceRow";
import {
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const meta = {
  title: "Work/ReferenceRow",
  component: ReferenceRow,
  tags: ["autodocs"],
  args: {
    onArchive: fn(),
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReferenceRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const basicRef = createReferenceMaterial({
  name: "Company style guide",
  origin: "captured",
});

const pdfRef = createReferenceMaterial({
  name: "Annual report 2025",
  encodingFormat: "application/pdf",
  origin: "captured",
});

const urlRef = createReferenceMaterial({
  name: "React documentation",
  url: "https://react.dev",
  origin: "captured",
  description: "Useful for component patterns.",
});

const triagedRef = createReferenceMaterial({
  name: "Meeting notes from standup",
  origin: "triaged",
});

const fileRef = createReferenceMaterial({
  name: "Invoice Q4-2025.pdf",
  encodingFormat: "application/pdf",
  origin: "file",
});

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { reference: basicRef },
};

export const WithContentType: Story = {
  args: { reference: pdfRef },
};

export const WithExternalUrl: Story = {
  args: { reference: urlRef },
};

export const TriagedOrigin: Story = {
  args: { reference: triagedRef },
};

export const FileOrigin: Story = {
  args: { reference: fileRef },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Click the archive menu and archive the reference. */
export const ArchiveAction: Story = {
  args: { reference: basicRef },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByLabelText("Actions for Company style guide"),
    );
    await expect(canvas.getByText("Archive")).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Archive"));
    await expect(args.onArchive).toHaveBeenCalledWith(basicRef.id);
  },
};

/** Click the title to select a reference. */
export const SelectReference: Story = {
  args: { reference: basicRef },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Company style guide"));
    await expect(args.onSelect).toHaveBeenCalledWith(basicRef.id);
  },
};

// ---------------------------------------------------------------------------
// Notes & expanded editor
// ---------------------------------------------------------------------------

/** Expanded — shows inline ItemEditor with notes visible. */
export const ExpandedWithNotes: Story = {
  args: {
    reference: urlRef,
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
};

/** Click the notes icon to expand. */
export const ClickNotesIcon: Story = {
  args: {
    reference: urlRef,
    onToggleExpand: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByLabelText(`Show notes for ${urlRef.name}`),
    );
    await expect(args.onToggleExpand).toHaveBeenCalledOnce();
  },
};
