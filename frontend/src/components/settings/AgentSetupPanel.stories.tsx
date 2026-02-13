import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import {
  AgentSetupPanel,
  type AgentSettings,
  type AgentBackend,
  type AgentProvider,
} from "./AgentSetupPanel";

const DEFAULT_SETTINGS: AgentSettings = {
  agentBackend: "haystack",
  provider: "openrouter",
  hasApiKey: false,
  model: "google/gemini-3-flash-preview",
  containerStatus: null,
  containerError: null,
};

const meta = {
  title: "Settings/AgentSetupPanel",
  component: AgentSetupPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgentSetupPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — Haystack (standard) selected
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    settings: DEFAULT_SETTINGS,
    onUpdate: fn(),
  },
};

// ---------------------------------------------------------------------------
// OpenClaw — with no API key
// ---------------------------------------------------------------------------

export const OpenClawNoKey: Story = {
  args: {
    settings: {
      ...DEFAULT_SETTINGS,
      agentBackend: "openclaw",
    },
    onUpdate: fn(),
    onDeleteApiKey: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// OpenClaw — with API key saved
// ---------------------------------------------------------------------------

export const OpenClawWithKey: Story = {
  args: {
    settings: {
      agentBackend: "openclaw",
      provider: "anthropic",
      hasApiKey: true,
      model: "anthropic/claude-sonnet-4.5",
      containerStatus: null,
      containerError: null,
    },
    onUpdate: fn(),
    onDeleteApiKey: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// Container status: Running
// ---------------------------------------------------------------------------

export const ContainerRunning: Story = {
  args: {
    settings: {
      agentBackend: "openclaw",
      provider: "openrouter",
      hasApiKey: true,
      model: "google/gemini-3-flash-preview",
      containerStatus: "running",
      containerError: null,
    },
    onUpdate: fn(),
    onDeleteApiKey: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// Container status: Starting
// ---------------------------------------------------------------------------

export const ContainerStarting: Story = {
  args: {
    settings: {
      agentBackend: "openclaw",
      provider: "openrouter",
      hasApiKey: true,
      model: "google/gemini-3-flash-preview",
      containerStatus: "starting",
      containerError: null,
    },
    onUpdate: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// Container status: Stopped
// ---------------------------------------------------------------------------

export const ContainerStopped: Story = {
  args: {
    settings: {
      agentBackend: "openclaw",
      provider: "openrouter",
      hasApiKey: true,
      model: "google/gemini-3-flash-preview",
      containerStatus: "stopped",
      containerError: null,
    },
    onUpdate: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// Container status: Error
// ---------------------------------------------------------------------------

export const ContainerError: Story = {
  args: {
    settings: {
      agentBackend: "openclaw",
      provider: "openrouter",
      hasApiKey: true,
      model: "google/gemini-3-flash-preview",
      containerStatus: "error",
      containerError: "Health check timeout after 15s",
    },
    onUpdate: fn(),
    onStopContainer: fn(),
    onRestartContainer: fn(),
  },
};

// ---------------------------------------------------------------------------
// Saving state
// ---------------------------------------------------------------------------

export const Saving: Story = {
  args: {
    settings: {
      ...DEFAULT_SETTINGS,
      agentBackend: "openclaw",
    },
    onUpdate: fn(),
    isSaving: true,
  },
};

// ---------------------------------------------------------------------------
// Interactive — switch backends and configure
// ---------------------------------------------------------------------------

function InteractiveSetup() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);

  const handleUpdate = (update: {
    agentBackend?: AgentBackend;
    provider?: AgentProvider;
    apiKey?: string;
    model?: string;
  }) => {
    setSettings((prev) => ({
      ...prev,
      ...(update.agentBackend && { agentBackend: update.agentBackend }),
      ...(update.provider && { provider: update.provider }),
      ...(update.apiKey && { hasApiKey: true }),
      ...(update.model && { model: update.model }),
    }));
  };

  return (
    <AgentSetupPanel
      settings={settings}
      onUpdate={handleUpdate}
      onDeleteApiKey={() =>
        setSettings((prev) => ({ ...prev, hasApiKey: false }))
      }
      onStopContainer={() =>
        setSettings((prev) => ({ ...prev, containerStatus: "stopped" }))
      }
      onRestartContainer={() =>
        setSettings((prev) => ({ ...prev, containerStatus: "starting" }))
      }
    />
  );
}

export const Interactive: Story = {
  args: {
    settings: DEFAULT_SETTINGS,
    onUpdate: fn(),
  },
  render: () => <InteractiveSetup />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Switch to OpenClaw backend", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /OpenClaw/i }));
      await expect(
        canvas.getByRole("button", { name: /OpenClaw/i }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    await step("Provider dropdown appears", async () => {
      await expect(canvas.getByLabelText("LLM Provider")).toBeInTheDocument();
    });

    await step("API key input appears", async () => {
      await expect(canvas.getByPlaceholderText("sk-...")).toBeInTheDocument();
    });
  },
};
