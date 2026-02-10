import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from "./ErrorBoundary";

function ProblemChild(): JSX.Element {
  throw new Error("Something broke in the application!");
}

const meta = {
  title: "Shell/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p className="p-8 text-text">The app is running normally.</p>,
  },
};

export const ErrorState: Story = {
  args: {
    children: <ProblemChild />,
  },
};
