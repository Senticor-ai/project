import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, within } from "storybook/test";
import { ChatInput } from "./ChatInput";

const meta = {
  title: "Chat/ChatInput",
  component: ChatInput,
  args: {
    onSend: fn(),
  },
} satisfies Meta<typeof ChatInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const TypeAndSend: Story = {
  play: async ({ canvas, userEvent: ue }) => {
    const textarea = canvas.getByRole("textbox", { name: "Nachricht an Tay" });
    await ue.type(textarea, "Hallo Tay!");

    const sendButton = canvas.getByRole("button", { name: "Senden" });
    expect(sendButton).not.toBeDisabled();
  },
};

export const MultiLine: Story = {
  play: async ({ canvas, userEvent: ue }) => {
    const textarea = canvas.getByRole("textbox", { name: "Nachricht an Tay" });
    await ue.type(textarea, "Zeile 1{Shift>}{Enter}{/Shift}Zeile 2");
    expect(within(canvas.getByRole("textbox")).getByRole).toBeDefined();
  },
};
