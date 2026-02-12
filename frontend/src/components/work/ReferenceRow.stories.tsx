import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ReferenceRow } from "./ReferenceRow";
import {
  createReferenceMaterial,
  createProject,
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

// ---------------------------------------------------------------------------
// Split-on-triage (ReadAction ↔ Reference relationship)
// ---------------------------------------------------------------------------

const splitPdfRef = createReferenceMaterial({
  name: "BSI-TR-03183-2.pdf",
  encodingFormat: "application/pdf",
  origin: "triaged",
});

/** DigitalDocument split from inbox triage — shows "Triaged" origin badge. */
export const TriagedFromInbox: Story = {
  args: { reference: splitPdfRef },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Triaged")).toBeInTheDocument();
    await expect(canvas.getByText("PDF")).toBeInTheDocument();
  },
};

/** Split reference with linked action — shows bucket badge for the ReadAction. */
export const TriagedWithActionLink: Story = {
  args: {
    reference: splitPdfRef,
    linkedActionBucket: "next",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Triaged")).toBeInTheDocument();
    await expect(canvas.getByText("Next")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// File view + download links
// ---------------------------------------------------------------------------

const downloadableRef = createReferenceMaterial({
  name: "Quarterly Report.pdf",
  encodingFormat: "application/pdf",
  origin: "triaged",
  downloadUrl: "/files/file-42",
});

/** PDF — browser-viewable: shows eye icon (view) + download icon. */
export const WithViewAndDownload: Story = {
  args: { reference: downloadableRef },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("View file")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Download file")).toBeInTheDocument();
  },
};

const docxRef = createReferenceMaterial({
  name: "Meeting Notes.docx",
  encodingFormat:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  origin: "triaged",
  downloadUrl: "/files/file-docx",
});

/** DOCX — not browser-viewable: shows only download icon, no view. */
export const NonViewableDownloadOnly: Story = {
  args: { reference: docxRef },
  play: async ({ canvas }) => {
    await expect(canvas.queryByLabelText("View file")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Download file")).toBeInTheDocument();
  },
};

const downloadableUrlRef = createReferenceMaterial({
  name: "Spec document",
  encodingFormat: "application/pdf",
  origin: "captured",
  url: "https://example.com/spec",
  downloadUrl: "/files/file-99",
});

/** Reference with external URL + file — shows all three icons. */
export const WithAllLinks: Story = {
  args: { reference: downloadableUrlRef },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText("Open external link"),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("View file")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Download file")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Project badge
// ---------------------------------------------------------------------------

const taxProject = createProject({
  name: "Steuererklärung 2025",
  desiredOutcome: "CPA Übergabe",
});

const projectLinkedRef = createReferenceMaterial({
  name: "W-2 Form.pdf",
  encodingFormat: "application/pdf",
  origin: "triaged",
  projectId: taxProject.id,
});

/** Reference linked to a project — shows project name badge. */
export const WithProjectBadge: Story = {
  args: {
    reference: projectLinkedRef,
    projects: [taxProject],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Steuererklärung 2025")).toBeInTheDocument();
    await expect(canvas.getByText("PDF")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const taggedRef = createReferenceMaterial({
  name: "1099-INT Schwab.pdf",
  encodingFormat: "application/pdf",
  origin: "triaged",
  tags: ["1099-int", "schedule-b"],
});

/** Reference with tags — shows amber tag chips. */
export const WithTags: Story = {
  args: { reference: taggedRef },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1099-int")).toBeInTheDocument();
    await expect(canvas.getByText("schedule-b")).toBeInTheDocument();
    await expect(canvas.getByText("PDF")).toBeInTheDocument();
  },
};
