import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export type AgentBackend = "haystack" | "openclaw";
export type AgentProvider = "openrouter" | "openai" | "anthropic";
export type ValidationStatus = "ok" | "error" | "warning";

export interface AgentSettings {
  agentBackend: AgentBackend;
  provider: AgentProvider;
  hasApiKey: boolean;
  model: string;
  devToolsEnabled?: boolean;
  containerStatus: string | null;
  containerError: string | null;
  validationStatus?: ValidationStatus | null;
  validationMessage?: string | null;
  modelAvailable?: boolean | null;
  creditsRemainingUsd?: number | null;
  creditsUsedUsd?: number | null;
  creditsLimitUsd?: number | null;
  lastValidatedAt?: string | null;
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
  onHardRefreshContainer?: () => void;
  isSaving?: boolean;
  saveError?: string | null;
  isContainerActionPending?: boolean;
  className?: string;
}

const labelClass = "mb-1 flex items-center gap-1 text-xs text-text-muted";
const selectClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";
const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";

const PROVIDERS_BY_BACKEND: Record<AgentBackend, AgentProvider[]> = {
  haystack: ["openrouter", "openai"],
  openclaw: ["openrouter", "openai", "anthropic"],
};

const MODEL_OPTIONS: Record<AgentProvider, string[]> = {
  openrouter: [
    "google/gemini-3-flash-preview",
    "deepseek/deepseek-v3.2",
    "openai/gpt-4o-mini",
    "anthropic/claude-sonnet-4.5",
  ],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  anthropic: [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-6",
    "claude-3-7-sonnet-latest",
  ],
};

function formatUsd(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCheckedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

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

const VALIDATION_UI: Record<
  ValidationStatus,
  { icon: string; color: string; label: string }
> = {
  ok: { icon: "check_circle", color: "text-green-600", label: "Validiert" },
  warning: { icon: "warning", color: "text-amber-600", label: "Hinweis" },
  error: { icon: "error", color: "text-red-600", label: "Fehler" },
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

function ValidationSummary({ settings }: { settings: AgentSettings }) {
  const status = settings.validationStatus ?? null;
  const statusUi = status ? VALIDATION_UI[status] : null;
  const checkedAt = formatCheckedAt(settings.lastValidatedAt);
  const remaining = formatUsd(settings.creditsRemainingUsd);
  const used = formatUsd(settings.creditsUsedUsd);
  const limit = formatUsd(settings.creditsLimitUsd);

  if (
    !statusUi &&
    settings.validationMessage == null &&
    settings.creditsRemainingUsd == null &&
    checkedAt == null
  ) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-paper-100 p-2">
      {statusUi && (
        <div className="mb-1 flex items-center gap-1.5">
          <Icon name={statusUi.icon} size={12} className={statusUi.color} />
          <span className={cn("text-xs font-medium", statusUi.color)}>
            {statusUi.label}
          </span>
        </div>
      )}
      {settings.validationMessage && (
        <p className="text-[10px] text-text-muted">
          {settings.validationMessage}
        </p>
      )}
      {remaining && (
        <p className="mt-1 text-[10px] text-text-muted">
          Remaining credits:{" "}
          <span className="font-medium text-text-primary">{remaining}</span>
          {limit && used ? ` (${used} used of ${limit})` : ""}
        </p>
      )}
      {checkedAt && (
        <p className="mt-1 text-[10px] text-text-muted">
          Last checked: {checkedAt}
        </p>
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
  onHardRefreshContainer,
  isSaving,
  saveError,
  isContainerActionPending,
  className,
}: AgentSetupPanelProps) {
  const [providerInput, setProviderInput] = useState<AgentProvider | null>(
    null,
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState<string | null>(null);

  const providerValue = providerInput ?? settings.provider;
  const modelValue = modelInput ?? settings.model;
  const availableProviders = PROVIDERS_BY_BACKEND[settings.agentBackend];
  const modelSuggestions = MODEL_OPTIONS[providerValue];

  const hasProviderChange = providerValue !== settings.provider;
  const hasApiKeyChange = apiKeyInput.trim().length > 0;
  const hasModelChange = modelValue.trim() !== settings.model;
  const hasModelError = modelValue.trim().length === 0;
  const hasPendingChanges =
    hasProviderChange || hasApiKeyChange || hasModelChange;

  const canRestart =
    onRestartContainer &&
    settings.hasApiKey &&
    settings.containerStatus != null &&
    settings.containerStatus !== "starting";
  const canHardRefresh =
    settings.devToolsEnabled &&
    onHardRefreshContainer &&
    settings.containerStatus !== "starting";

  const modelPlaceholder = useMemo(
    () => MODEL_OPTIONS[providerValue][0] ?? "Model identifier",
    [providerValue],
  );

  const handleBackendChange = (nextBackend: AgentBackend) => {
    const nextProviders = PROVIDERS_BY_BACKEND[nextBackend];
    const fallbackProvider = nextProviders[0] ?? settings.provider;
    const nextProvider: AgentProvider = nextProviders.includes(providerValue)
      ? providerValue
      : fallbackProvider;
    const update: Parameters<typeof onUpdate>[0] = {
      agentBackend: nextBackend,
    };
    if (nextProvider !== providerValue) {
      setProviderInput(nextProvider);
      const fallbackModel = MODEL_OPTIONS[nextProvider][0];
      if (fallbackModel) {
        setModelInput(fallbackModel);
        update.model = fallbackModel;
      }
      update.provider = nextProvider;
    }
    onUpdate(update);
  };

  const handleProviderChange = (provider: AgentProvider) => {
    setProviderInput(provider);
    if (MODEL_OPTIONS[provider].includes(modelValue.trim())) {
      return;
    }
    const fallbackModel = MODEL_OPTIONS[provider][0];
    if (fallbackModel) {
      setModelInput(fallbackModel);
    }
  };

  const handleSave = () => {
    const update: Parameters<typeof onUpdate>[0] = {};
    if (hasProviderChange) update.provider = providerValue;
    if (hasModelChange) update.model = modelValue.trim();
    if (hasApiKeyChange) update.apiKey = apiKeyInput.trim();
    onUpdate(update);
    if (hasApiKeyChange) setApiKeyInput("");
  };

  return (
    <div className={cn("space-y-6", className)}>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <Icon name="smart_toy" size={14} className="mr-1 align-text-bottom" />
          Agent Backend
        </h2>

        <ToggleGroup
          options={[
            {
              value: "haystack" as AgentBackend,
              label: "Copilot",
              description:
                "Use your own OpenRouter/OpenAI key. Suggests changes for your approval.",
            },
            {
              value: "openclaw" as AgentBackend,
              label: "OpenClaw",
              description:
                "Self-hosted autonomous agent. Uses your provider key directly.",
            },
          ]}
          value={settings.agentBackend}
          onChange={handleBackendChange}
        />
      </section>

      {settings.agentBackend === "openclaw" && (
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
            {canHardRefresh && (
              <button
                type="button"
                onClick={onHardRefreshContainer}
                disabled={isContainerActionPending}
                className={cn(
                  "flex items-center gap-1 rounded-[var(--radius-sm)] border border-status-error/40 px-2 py-1 text-xs text-status-error",
                  isContainerActionPending ? "opacity-60" : "hover:bg-red-50",
                )}
              >
                <Icon name="delete_forever" size={12} />
                Hard refresh (dev)
              </button>
            )}
          </div>
          {settings.devToolsEnabled && (
            <p className="text-[10px] text-text-muted">
              Hard refresh stops the container and resets OpenClaw workspace +
              runtime state for this user.
            </p>
          )}
        </section>
      )}

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
            value={providerValue}
            onChange={(e) =>
              handleProviderChange(e.target.value as AgentProvider)
            }
            className={selectClass}
          >
            {availableProviders.includes("openrouter") && (
              <option value="openrouter">OpenRouter</option>
            )}
            {availableProviders.includes("openai") && (
              <option value="openai">OpenAI</option>
            )}
            {availableProviders.includes("anthropic") && (
              <option value="anthropic">Anthropic</option>
            )}
          </select>
        </div>

        <div className="space-y-2">
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
            <p className="text-[10px] text-text-muted">
              Add your API key and save to run validation checks.
            </p>
          )}
          <input
            id="agent-api-key"
            type="password"
            placeholder="sk-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className={inputClass}
          />
          <ValidationSummary settings={settings} />
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
            list={`agent-model-options-${providerValue}`}
            type="text"
            value={modelValue}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={modelPlaceholder}
            className={inputClass}
          />
          <datalist id={`agent-model-options-${providerValue}`}>
            {modelSuggestions.map((modelId) => (
              <option key={modelId} value={modelId} />
            ))}
          </datalist>
          <p className="mt-1 text-[10px] text-text-muted">
            Suggested models match the OpenClaw presets for this provider.
          </p>
          {hasModelError && (
            <p className="mt-1 text-[10px] text-red-600">
              Model must not be empty.
            </p>
          )}
        </div>
      </section>

      {saveError && (
        <div className="rounded-[var(--radius-sm)] border border-red-300 bg-red-50 p-2">
          <p className="text-xs text-red-700">{saveError}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!hasPendingChanges || hasModelError || isSaving}
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-4 py-1.5 text-xs font-medium",
          hasPendingChanges && !hasModelError && !isSaving
            ? "border-blueprint-500 bg-blueprint-500 text-white hover:bg-blueprint-600"
            : "border-border bg-paper-100 text-text-muted",
        )}
      >
        {isSaving ? (
          <>
            <Icon name="sync" size={12} className="animate-spin" />
            Saving + testing...
          </>
        ) : (
          "Save and validate"
        )}
      </button>
    </div>
  );
}
