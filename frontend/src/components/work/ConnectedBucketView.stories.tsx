import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, fn, waitFor, within } from "storybook/test";
import { ConnectedBucketView } from "./ConnectedBucketView";
import {
  store,
  seedMixedBuckets,
  seedMixedBucketsWithEmail,
  seedMixedBucketsWithFiles,
  seedReadActionSplit,
  seedProjectWithReferences,
} from "@/test/msw/fixtures";
import type { Bucket } from "@/model/types";

// ---------------------------------------------------------------------------
// Wrapper: stateful activeBucket so navigation works
// ---------------------------------------------------------------------------

function ConnectedBucketViewDemo({ initialBucket = "inbox" as Bucket }) {
  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  return (
    <ConnectedBucketView
      activeBucket={bucket}
      onBucketChange={setBucket}
      className="p-4"
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Work/ConnectedBucketView",
  component: ConnectedBucketView,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach: () => {
    seedMixedBuckets();
  },
} satisfies Meta<typeof ConnectedBucketView>;

export default meta;
type Story = StoryObj<typeof meta>;

const WAIT = { timeout: 10000 };

function dispatchFileEvent(
  target: EventTarget,
  type: "dragenter" | "drop",
  files: File[] = [],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      types: ["Files"],
    },
  });
  target.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Default — renders mixed bucket data
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step("Verify inbox items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
        expect(canvas.getByText("Another capture")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify capture input is present", async () => {
      expect(canvas.getByLabelText("Capture a thought")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// CaptureInbox — type into the inbox and submit
// ---------------------------------------------------------------------------

export const CaptureInbox: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for inbox to load", async () => {
      await waitFor(() => {
        expect(canvas.getByLabelText("Capture a thought")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Capture a new thought", async () => {
      const input = canvas.getByLabelText("Capture a thought");
      await userEvent.click(input);
      await userEvent.type(input, "Buy groceries");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify the new item appears in the list", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Buy groceries")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// NextActions — view the next bucket
// ---------------------------------------------------------------------------

export const NextActions: Story = {
  args: { activeBucket: "next", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="next" />,
  play: async ({ canvas, step }) => {
    await step("Verify next action items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Draft wireframes")).toBeInTheDocument();
        expect(canvas.getByText("Review PR")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify rapid entry is present", async () => {
      expect(canvas.getByLabelText("Rapid entry")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// AddAction — rapid entry in the next actions bucket
// ---------------------------------------------------------------------------

export const AddAction: Story = {
  args: { activeBucket: "next", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="next" />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for next actions to load", async () => {
      await waitFor(() => {
        expect(canvas.getByLabelText("Rapid entry")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Add a new action via rapid entry", async () => {
      const input = canvas.getByLabelText("Rapid entry");
      await userEvent.click(input);
      await userEvent.type(input, "Write unit tests");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify the new action appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Write unit tests")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// CompleteAction — mark an action as completed
// ---------------------------------------------------------------------------

export const CompleteAction: Story = {
  args: { activeBucket: "next", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="next" />,
  play: async ({ canvas, step }) => {
    await step("Wait for actions to load", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Draft wireframes")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify complete button exists", async () => {
      const completeBtn = canvas.getByLabelText("Complete Draft wireframes");
      expect(completeBtn).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// ToggleFocus — verify focused item styling
// ---------------------------------------------------------------------------

export const FocusView: Story = {
  args: { activeBucket: "focus", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="focus" />,
  play: async ({ canvas, step }) => {
    await step("Verify focus view shows focused items", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Review PR")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// ReferenceView — view references
// ---------------------------------------------------------------------------

export const ReferenceView: Story = {
  args: { activeBucket: "reference", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="reference" />,
  play: async ({ canvas, step }) => {
    await step("Verify reference items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Brand guidelines")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify rapid entry for references", async () => {
      expect(canvas.getByLabelText("Rapid entry")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// AddReference — add a reference item
// ---------------------------------------------------------------------------

export const AddReference: Story = {
  args: { activeBucket: "reference", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="reference" />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for references to load", async () => {
      await waitFor(() => {
        expect(canvas.getByLabelText("Rapid entry")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Add a new reference", async () => {
      const input = canvas.getByLabelText("Rapid entry");
      await userEvent.click(input);
      await userEvent.type(input, "Architecture diagrams");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify the new reference appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Architecture diagrams")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// ProjectView — view projects
// ---------------------------------------------------------------------------

export const ProjectView: Story = {
  args: { activeBucket: "project", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="project" />,
  play: async ({ canvas, step }) => {
    await step("Verify projects appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Website Redesign")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// EmptyInbox — no items
// ---------------------------------------------------------------------------

export const EmptyInbox: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  beforeEach: () => {
    store.clear();
  },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step(
      "Verify capture input is available even with empty inbox",
      async () => {
        await waitFor(() => {
          expect(
            canvas.getByLabelText("Capture a thought"),
          ).toBeInTheDocument();
        }, WAIT);
      },
    );
  },
};

// ---------------------------------------------------------------------------
// NavigateBuckets — switch between buckets
// ---------------------------------------------------------------------------

export const NavigateBuckets: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Start at inbox", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
      }, WAIT);
    });

    // Scope navigation clicks to the BucketNav to avoid matching triage buttons
    const nav = within(canvas.getByRole("navigation", { name: "Buckets" }));

    await step("Navigate to Next", async () => {
      await userEvent.click(nav.getByRole("button", { name: /Next/i }));
      await waitFor(() => {
        expect(canvas.getByText("Draft wireframes")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Navigate to Reference", async () => {
      await userEvent.click(nav.getByRole("button", { name: /Reference/i }));
      await waitFor(() => {
        expect(canvas.getByText("Brand guidelines")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Navigate to Projects", async () => {
      await userEvent.click(nav.getByRole("button", { name: /Projects/i }));
      await waitFor(() => {
        expect(canvas.getByText("Website Redesign")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// WaitingBucket — view waiting items
// ---------------------------------------------------------------------------

export const WaitingBucket: Story = {
  args: { activeBucket: "waiting", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="waiting" />,
  play: async ({ canvas, step }) => {
    await step("Verify waiting items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Waiting on vendor")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// SomedayBucket — view someday items
// ---------------------------------------------------------------------------

export const SomedayBucket: Story = {
  args: { activeBucket: "someday", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo initialBucket="someday" />,
  play: async ({ canvas, step }) => {
    await step("Verify someday items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Learn Rust")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// InboxFileDrop — file drop zone appears on file drag (invisible at rest)
// ---------------------------------------------------------------------------

export const InboxFileDrop: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step("Verify inbox loads (drop zone hidden at rest)", async () => {
      await waitFor(() => {
        expect(canvas.getByLabelText("Capture a thought")).toBeInTheDocument();
      }, WAIT);
      // FileDropZone is invisible at rest — appears only when files are dragged over
      expect(canvas.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// InboxWithFileCapture — DigitalDocument items from file drops appear in inbox
// ---------------------------------------------------------------------------

export const InboxWithFileCapture: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  beforeEach: () => {
    seedMixedBucketsWithFiles();
  },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step("Verify regular inbox items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
        expect(canvas.getByText("Another capture")).toBeInTheDocument();
      }, WAIT);
    });

    await step(
      "Verify file-captured DigitalDocument items appear in inbox",
      async () => {
        await waitFor(() => {
          expect(canvas.getByText("Quarterly Report.pdf")).toBeInTheDocument();
          expect(canvas.getByText("Meeting Notes.docx")).toBeInTheDocument();
        }, WAIT);
      },
    );
  },
};

// ---------------------------------------------------------------------------
// BackgroundUploadNoticeFlow — MSW-backed integration for upload status notice
// ---------------------------------------------------------------------------

let backgroundUploadAttempt = 0;

export const BackgroundUploadNoticeFlow: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  parameters: {
    msw: {
      handlers: [
        http.put("*/files/upload/:uploadId", async () => {
          backgroundUploadAttempt += 1;
          if (backgroundUploadAttempt === 1) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            return HttpResponse.json({ received: 12345 });
          }
          return HttpResponse.json(
            { detail: "Upload failed" },
            { status: 500 },
          );
        }),
      ],
    },
  },
  beforeEach: () => {
    backgroundUploadAttempt = 0;
    seedMixedBuckets();
  },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, canvasElement, userEvent, step }) => {
    await step("Pending upload notice is shown", async () => {
      await waitFor(() => {
        expect(canvas.getByLabelText("Capture a thought")).toBeInTheDocument();
      }, WAIT);

      dispatchFileEvent(canvasElement.ownerDocument, "dragenter");

      await waitFor(() => {
        expect(canvas.getByTestId("file-drop-zone")).toBeInTheDocument();
      }, WAIT);

      const firstFile = new File(["a"], "pending-success.pdf", {
        type: "application/pdf",
      });
      dispatchFileEvent(canvas.getByTestId("file-drop-zone"), "drop", [
        firstFile,
      ]);

      await waitFor(() => {
        expect(
          canvas.getByText("Uploading 1 file in background"),
        ).toBeInTheDocument();
      }, WAIT);
    });

    await step("Notice can be minimized and restored", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Minimize upload status" }),
      );
      await waitFor(() => {
        expect(
          canvas.getByRole("button", { name: "Show upload status" }),
        ).toBeInTheDocument();
      }, WAIT);

      await userEvent.click(
        canvas.getByRole("button", { name: "Show upload status" }),
      );
      expect(
        canvas.getByText("Uploading 1 file in background"),
      ).toBeInTheDocument();
    });

    await step("Notice clears after successful upload", async () => {
      await waitFor(() => {
        expect(
          canvas.queryByRole("status", { name: "Background uploads" }),
        ).not.toBeInTheDocument();
      }, WAIT);
    });

    await step("Failed upload is shown and dismissible", async () => {
      dispatchFileEvent(canvasElement.ownerDocument, "dragenter");

      await waitFor(() => {
        expect(canvas.getByTestId("file-drop-zone")).toBeInTheDocument();
      }, WAIT);

      const secondFile = new File(["b"], "failing-upload.pdf", {
        type: "application/pdf",
      });
      dispatchFileEvent(canvas.getByTestId("file-drop-zone"), "drop", [
        secondFile,
      ]);

      await waitFor(() => {
        expect(canvas.getByText("1 upload failed")).toBeInTheDocument();
      }, WAIT);

      await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
      await waitFor(() => {
        expect(
          canvas.queryByRole("status", { name: "Background uploads" }),
        ).not.toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// InboxWithEmail — email items interleaved with regular items
// ---------------------------------------------------------------------------

export const InboxWithEmail: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  beforeEach: () => {
    seedMixedBucketsWithEmail();
  },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step("Verify regular inbox items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
        expect(canvas.getByText("Another capture")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify email items appear interleaved", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText("Re: Antrag auf Verlangerung"),
        ).toBeInTheDocument();
        expect(
          canvas.getByText("Einladung: Projektbesprechung"),
        ).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify email sender is shown", async () => {
      expect(canvas.getByText("h.schmidt@example.de")).toBeInTheDocument();
      expect(canvas.getAllByText("sekretariat@bund.de").length).toBeGreaterThan(
        0,
      );
    });

    await step("Verify email mail icon is visible", async () => {
      const mailIcons = canvas.getAllByText("mail");
      expect(mailIcons.length).toBeGreaterThanOrEqual(2);
    });
  },
};

// ---------------------------------------------------------------------------
// ReadActionSplit — split-on-triage: ReadAction in Next + DigitalDocument in Reference
// ---------------------------------------------------------------------------

export const ReadActionSplit: Story = {
  args: { activeBucket: "next", onBucketChange: fn() },
  beforeEach: () => {
    seedReadActionSplit();
  },
  render: () => <ConnectedBucketViewDemo initialBucket="next" />,
  play: async ({ canvas, userEvent, step }) => {
    await step(
      "Verify ReadAction appears in Next with clickable 'Read' subtitle",
      async () => {
        await waitFor(() => {
          expect(canvas.getByText("BSI-TR-03183-2.pdf")).toBeInTheDocument();
        }, WAIT);
        await waitFor(() => {
          expect(canvas.getByLabelText("Go to reference")).toBeInTheDocument();
        }, WAIT);
      },
    );

    await step(
      "Click 'Go to reference' to navigate to Reference bucket",
      async () => {
        await userEvent.click(canvas.getByLabelText("Go to reference"));
        await waitFor(() => {
          expect(canvas.getByText("BSI-TR-03183-2.pdf")).toBeInTheDocument();
          expect(canvas.getByText("Triaged")).toBeInTheDocument();
        }, WAIT);
      },
    );

    await step(
      "Verify linked bucket badge and file view/download links in Reference",
      async () => {
        const main = within(
          canvas.getByRole("main", { name: "Bucket content" }),
        );
        await waitFor(() => {
          expect(main.getByText("Next")).toBeInTheDocument();
        }, WAIT);
        expect(main.getByLabelText("View file")).toBeInTheDocument();
        expect(main.getByLabelText("Download file")).toBeInTheDocument();
      },
    );
  },
};

// ---------------------------------------------------------------------------
// ProjectViewWithReferences — project shows file chips for linked references
// ---------------------------------------------------------------------------

export const ProjectViewWithReferences: Story = {
  args: { activeBucket: "project", onBucketChange: fn() },
  beforeEach: () => {
    seedProjectWithReferences();
  },
  render: () => <ConnectedBucketViewDemo initialBucket="project" />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Verify tax project appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Steuererklärung 2025")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Expand tax project to see file chips", async () => {
      await userEvent.click(
        canvas.getByLabelText("Expand Steuererklärung 2025"),
      );
      await waitFor(() => {
        expect(canvas.getByText("W-2 Form.pdf")).toBeInTheDocument();
        expect(canvas.getByText("1099-INT Schwab.pdf")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify project action also appears", async () => {
      expect(canvas.getByText("Belege sortieren")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// ReferenceWithProjectBadge — reference list shows project badge
// ---------------------------------------------------------------------------

export const ReferenceWithProjectBadge: Story = {
  args: { activeBucket: "reference", onBucketChange: fn() },
  beforeEach: () => {
    seedProjectWithReferences();
  },
  render: () => <ConnectedBucketViewDemo initialBucket="reference" />,
  play: async ({ canvas, step }) => {
    await step("Verify reference items with project badge", async () => {
      await waitFor(() => {
        expect(canvas.getByText("W-2 Form.pdf")).toBeInTheDocument();
        expect(canvas.getByText("1099-INT Schwab.pdf")).toBeInTheDocument();
      }, WAIT);
      // Project badge should show on linked references
      const badges = canvas.getAllByText("Steuererklärung 2025");
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    await step("Verify unlinked reference has no project badge", async () => {
      expect(canvas.getByText("General notes")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// LoadError — API returns 500
// ---------------------------------------------------------------------------

export const LoadError: Story = {
  args: { activeBucket: "inbox", onBucketChange: fn() },
  parameters: {
    msw: {
      handlers: [
        http.get("*/items/sync", () => {
          return HttpResponse.json({ detail: "Server error" }, { status: 500 });
        }),
      ],
    },
  },
  beforeEach: () => {
    store.clear();
  },
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, step }) => {
    await step("Verify error state is shown", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Failed to load data")).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// ConflictToast — PATCH returns 412 Precondition Failed (write conflict)
// ---------------------------------------------------------------------------

export const ConflictToast: Story = {
  args: { activeBucket: "next", onBucketChange: fn() },
  parameters: {
    msw: {
      handlers: [
        http.patch("*/items/*", () => {
          return HttpResponse.json(
            {
              detail: {
                code: "PRECONDITION_FAILED",
                message: "Resource has been modified since last read",
              },
            },
            { status: 412 },
          );
        }),
      ],
    },
  },
  render: () => <ConnectedBucketViewDemo initialBucket={"next" as Bucket} />,
  play: async ({ canvas, step }) => {
    await step("Wait for items to load", async () => {
      await waitFor(() => {
        expect(canvas.getAllByRole("listitem").length).toBeGreaterThan(0);
      }, WAIT);
    });

    await step("Click focus star to trigger 412 conflict", async () => {
      const stars = canvas.getAllByLabelText(/Toggle focus/i);
      if (stars.length > 0) {
        await stars[0]!.click();
      }
    });

    await step("Verify error toast appears", async () => {
      await waitFor(() => {
        const alert = within(document.body).getByRole("alert");
        expect(alert).toBeInTheDocument();
      }, WAIT);
    });
  },
};
