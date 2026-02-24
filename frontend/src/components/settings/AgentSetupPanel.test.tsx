import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentSetupPanel, type AgentSettings } from "./AgentSetupPanel";

const baseSettings: AgentSettings = {
  agentBackend: "haystack",
  provider: "openrouter",
  hasApiKey: false,
  model: "google/gemini-3-flash-preview",
  containerStatus: null,
  containerError: null,
};

describe("AgentSetupPanel", () => {
  it("shows provider config for Copilot backend", () => {
    render(<AgentSetupPanel settings={baseSettings} onUpdate={vi.fn()} />);

    expect(screen.getByLabelText("LLM Provider")).toHaveValue("openrouter");
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Model identifier")).toHaveValue(
      "google/gemini-3-flash-preview",
    );
  });

  it("saves provider + model + key together", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<AgentSetupPanel settings={baseSettings} onUpdate={onUpdate} />);

    await user.selectOptions(screen.getByLabelText("LLM Provider"), "openai");
    await user.clear(screen.getByLabelText("Model identifier"));
    await user.type(screen.getByLabelText("Model identifier"), "gpt-4o-mini");
    await user.type(screen.getByLabelText("API Key"), "sk-openai-test");
    await user.click(screen.getByRole("button", { name: "Save and validate" }));

    expect(onUpdate).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-openai-test",
    });
  });

  it("renders remaining credit stats when available", () => {
    render(
      <AgentSetupPanel
        settings={{
          ...baseSettings,
          hasApiKey: true,
          validationStatus: "ok",
          validationMessage: "OpenRouter key is valid.",
          creditsRemainingUsd: 42.5,
          creditsUsedUsd: 7.5,
          creditsLimitUsd: 50,
          lastValidatedAt: "2026-02-24T10:00:00+00:00",
        }}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText(/Remaining credits:/i)).toBeInTheDocument();
    expect(screen.getByText(/\$42\.50/i)).toBeInTheDocument();
    expect(screen.getByText(/Last checked:/i)).toBeInTheDocument();
  });
});
