import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ToastContainer } from "./ToastContainer";

const meta = {
  title: "UI/ToastContainer",
  component: ToastContainer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ToastContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ErrorToast: Story = {
  args: {
    toasts: [{ id: "1", message: "Failed to save changes", type: "error" }],
    onDismiss: fn(),
  },
};

export const SuccessToast: Story = {
  args: {
    toasts: [{ id: "1", message: "Item moved to Next", type: "success" }],
    onDismiss: fn(),
  },
};

export const InfoToast: Story = {
  args: {
    toasts: [
      {
        id: "1",
        message: "You are offline — changes will sync later",
        type: "info",
      },
    ],
    onDismiss: fn(),
  },
};

export const MultipleToasts: Story = {
  args: {
    toasts: [
      { id: "1", message: "Item archived", type: "success" },
      { id: "2", message: "Failed to sync", type: "error" },
      { id: "3", message: "Session refreshed", type: "info" },
    ],
    onDismiss: fn(),
  },
};
