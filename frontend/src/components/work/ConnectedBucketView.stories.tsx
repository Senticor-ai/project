import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { ConnectedBucketView } from "./ConnectedBucketView";
import { store, seedMixedBuckets } from "@/test/msw/fixtures";
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

// ---------------------------------------------------------------------------
// Default — renders mixed bucket data
// ---------------------------------------------------------------------------

export const Default: Story = {
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
// NextActions — view the next actions bucket
// ---------------------------------------------------------------------------

export const NextActions: Story = {
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
  render: () => <ConnectedBucketViewDemo initialBucket="next" />,
  play: async ({ canvas, step }) => {
    await step("Wait for actions to load", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Draft wireframes")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify complete button exists", async () => {
      const completeBtn = canvas.getByLabelText("Complete: Draft wireframes");
      expect(completeBtn).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// ToggleFocus — verify focused item styling
// ---------------------------------------------------------------------------

export const FocusView: Story = {
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
  render: () => <ConnectedBucketViewDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Start at inbox", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Navigate to Next Actions", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /Next Actions/i }),
      );
      await waitFor(() => {
        expect(canvas.getByText("Draft wireframes")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Navigate to Reference", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Reference/i }));
      await waitFor(() => {
        expect(canvas.getByText("Brand guidelines")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Navigate to Projects", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Projects/i }));
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
  render: () => <ConnectedBucketViewDemo initialBucket="someday" />,
  play: async ({ canvas, step }) => {
    await step("Verify someday items appear", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Learn Rust")).toBeInTheDocument();
      }, WAIT);
    });
  },
};
