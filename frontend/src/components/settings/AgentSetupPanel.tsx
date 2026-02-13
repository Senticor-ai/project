import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export type AgentBackend = "haystack" | "openclaw";
export type AgentProvider = "openrouter" | "openai" | "anthropic";

export interface AgentSettings {
  agentBackend: AgentBackend;
  provider: AgentProvider;
  hasApiKey: boolean;
  model: string;
  containerStatus: string | null;
  containerError: string | null;
}

export interface AgentSetupPanelProps {
  settings: AgentSettings;
  onUpdate: (update: {
    agentBackend?: AgentBackend;
    provider?: AgentProvider;
    apiKey?: string;
    model?: string;
  }) => void;
  onDeleteApiKey?: () => void;
  onStopContainer?: () => void;
  onRestartContainer?: () => void;
  isSaving?: boolean;
  isContainerActionPending?: boolean;
  className?: string;
}

const labelClass = "mb-1 flex items-center gap-1 text-xs text-text-muted";
const selectClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";
const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex w-full items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-xs",
            value === opt.value
              ? "border-blueprint-400 bg-blueprint-50"
              : "border-border hover:bg-paper-100",
          )}
        >
          <span
            className={cn(
              "mt-0.5 size-3 shrink-0 rounded-full border-2",
              value === opt.value
                ? "border-blueprint-500 bg-blueprint-500"
                : "border-text-muted",
            )}
          />
          <span>
            <span
              className={cn(
                "font-medium",
                value === opt.value
                  ? "text-blueprint-700"
                  : "text-text-primary",
              )}
            >
              {opt.label}
            </span>
            <span className="block text-text-muted">{opt.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

type StatusConfig = {
  icon: string;
  label: string;
  color: string;
  spin?: boolean;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  running: {
    icon: "play_circle",
    label: "Aktiv",
    color: "text-green-600",
  },
  stopped: {
    icon: "stop_circle",
    label: "Gestoppt",
    color: "text-text-muted",
  },
  starting: {
    icon: "sync",
    label: "Startet...",
    color: "text-blueprint-500",
    spin: true,
  },
  error: {
    icon: "error",
    label: "Fehler",
    color: "text-red-600",
  },
};

const DEFAULT_STATUS: StatusConfig = {
  icon: "circle",
  label: "Nicht gestartet",
  color: "text-text-muted",
};

function ContainerStatusBadge({
  status,
  error,
}: {
  status: string | null;
  error: string | null;
}) {
  const config = (status && STATUS_CONFIG[status]) || DEFAULT_STATUS;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon
          name={config.icon}
          size={14}
          className={cn(config.color, config.spin && "animate-spin")}
        />
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
      </div>
      {error && status === "error" && (
        <p className="text-[10px] text-red-600">{error}</p>
      )}
    </div>
  );
}

export function AgentSetupPanel({
  settings,
  onUpdate,
  onDeleteApiKey,
  onStopContainer,
  onRestartContainer,
  isSaving,
  isContainerActionPending,
  className,
}: AgentSetupPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(settings.model);

  const hasApiKeyChange = !settings.hasApiKey && apiKeyInput.trim().length > 0;
  const hasModelChange = modelInput !== settings.model;
  const hasPendingChanges = hasApiKeyChange || hasModelChange;

  const handleSave = () => {
    const update: Parameters<typeof onUpdate>[0] = {};
    if (hasApiKeyChange) update.apiKey = apiKeyInput.trim();
    if (hasModelChange) update.model = modelInput;
    onUpdate(update);
    if (hasApiKeyChange) setApiKeyInput("");
  };

  const canRestart =
    onRestartContainer &&
    settings.hasApiKey &&
    settings.containerStatus != null &&
    settings.containerStatus !== "starting";

  return (
    <div className={cn("space-y-6", className)}>
      {/* Backend Selection */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <Icon name="smart_toy" size={14} className="mr-1 align-text-bottom" />
          Agent Backend
        </h2>

        <ToggleGroup
          options={[
            {
              value: "haystack" as AgentBackend,
              label: "Tay",
              description:
                "Built-in agent with shared OpenRouter key. Suggests actions for your approval.",
            },
            {
              value: "openclaw" as AgentBackend,
              label: "OpenClaw",
              description:
                "Self-hosted agent with your own API keys. Acts autonomously on your behalf.",
            },
          ]}
          value={settings.agentBackend}
          onChange={(v) => onUpdate({ agentBackend: v })}
        />
      </section>

      {/* OpenClaw Configuration (shown only when openclaw selected) */}
      {settings.agentBackend === "openclaw" && (
        <>
          {/* Container Status */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-text-primary">
              <Icon name="dns" size={14} className="mr-1 align-text-bottom" />
              Container
            </h2>

            <ContainerStatusBadge
              status={settings.containerStatus}
              error={settings.containerError}
            />

            <div className="flex gap-2">
              {settings.containerStatus === "running" && onStopContainer && (
                <button
                  type="button"
                  onClick={onStopContainer}
                  disabled={isContainerActionPending}
                  className={cn(
                    "flex items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs",
                    isContainerActionPending
                      ? "text-text-muted"
                      : "hover:bg-paper-100",
                  )}
                >
                  <Icon name="stop" size={12} />
                  Stop
                </button>
              )}
              {canRestart && (
                <button
                  type="button"
                  onClick={onRestartContainer}
                  disabled={isContainerActionPending}
                  className={cn(
                    "flex items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs",
                    isContainerActionPending
                      ? "text-text-muted"
                      : "hover:bg-paper-100",
                  )}
                >
                  <Icon name="restart_alt" size={12} />
                  Restart
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-text-primary">
              <Icon name="key" size={14} className="mr-1 align-text-bottom" />
              LLM Provider
            </h2>

            <div>
              <label htmlFor="agent-provider" className={labelClass}>
                Provider
              </label>
              <select
                id="agent-provider"
                aria-label="LLM Provider"
                value={settings.provider}
                onChange={(e) =>
                  onUpdate({ provider: e.target.value as AgentProvider })
                }
                className={selectClass}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div>
              <label htmlFor="agent-api-key" className={labelClass}>
                API Key
              </label>
              {settings.hasApiKey ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Icon
                      name="check_circle"
                      size={12}
                      className="text-green-600"
                    />
                    Key saved
                  </span>
                  {onDeleteApiKey && (
                    <button
                      type="button"
                      onClick={onDeleteApiKey}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <input
                  id="agent-api-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-text-primary">
              <Icon
                name="model_training"
                size={14}
                className="mr-1 align-text-bottom"
              />
              Model
            </h2>

            <div>
              <label htmlFor="agent-model" className={labelClass}>
                Model identifier
              </label>
              <input
                id="agent-model"
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="google/gemini-3-flash-preview"
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                {settings.provider === "openrouter"
                  ? "e.g. google/gemini-3-flash-preview, deepseek/deepseek-v3.2, anthropic/claude-sonnet-4.5"
                  : settings.provider === "openai"
                    ? "e.g. gpt-4o"
                    : "e.g. claude-sonnet-4-5-20250929, claude-opus-4-6"}
              </p>
            </div>
          </section>

          {/* Unified save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasPendingChanges || isSaving}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-4 py-1.5 text-xs font-medium",
              hasPendingChanges && !isSaving
                ? "border-blueprint-500 bg-blueprint-500 text-white hover:bg-blueprint-600"
                : "border-border bg-paper-100 text-text-muted",
            )}
          >
            {isSaving ? (
              <>
                <Icon name="sync" size={12} className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </>
      )}
    </div>
  );
}
