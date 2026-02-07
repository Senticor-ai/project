import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { InboxCapture } from "./InboxCapture";

const meta = {
  title: "GTD/InboxCapture",
  component: InboxCapture,
  tags: ["autodocs"],
  args: {
    onCapture: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InboxCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: "Was geht dir durch den Kopf?",
  },
};

/** Type text and submit via Enter key. */
export const SubmitViaEnter: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture inbox item");
    await userEvent.type(input, "Neue Aufgabe erstellen");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCapture!).toHaveBeenCalledWith(
      "Neue Aufgabe erstellen",
    );
  },
};

/** Type text and submit via the Capture button. */
export const SubmitViaButton: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture inbox item");
    await userEvent.type(input, "Bericht schreiben");
    await userEvent.click(canvas.getByText("Capture"));
    await expect(args.onCapture!).toHaveBeenCalledWith("Bericht schreiben");
  },
};

/** Whitespace-only input should not trigger capture. */
export const WhitespaceRejected: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture inbox item");
    await userEvent.type(input, "   ");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCapture!).not.toHaveBeenCalled();
  },
};
