import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon";

// We can't easily toggle navigator.onLine in Storybook, so we render the
// banner UI directly to show its appearance.
function OfflineBannerPreview() {
  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        <Icon name="cloud_off" size={16} />
        <span>You are offline — changes will sync when reconnected</span>
      </div>
    </div>
  );
}

const meta = {
  title: "UI/OfflineBanner",
  component: OfflineBannerPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OfflineBannerPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
