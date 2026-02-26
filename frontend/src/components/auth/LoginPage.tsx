import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { getMessage } from "@/lib/messages";
import { ApiError } from "@/lib/api-client";
import { useOnlineStatus } from "@/hooks/use-online-status";

export interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  /** For storybook: pre-populate error state */
  initialError?: string;
  className?: string;
}

const DIFFERENTIATORS = [
  {
    icon: "hub",
    title: "Open ontology",
    description: "Schema.org-based, transparent, inspectable, versionable.",
  },
  {
    icon: "shield",
    title: "Sovereign compute",
    description: "Self-hosted or EU-based. BSI and EU AI Act compatible.",
  },
  {
    icon: "group",
    title: "Human\u2013AI co\u2011execution",
    description:
      "AI agents act as junior case workers. Humans retain legal responsibility.",
  },
  {
    icon: "verified",
    title: "Built-in legitimacy",
    description: "Full provenance, rule traceability, audit-ready by design.",
  },
] as const;

export function LoginPage({
  onLogin,
  onRegister,
  initialError,
  className,
}: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isOnline = useOnlineStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError(getMessage("login.error.invalidCredentials"));
        } else if (err.status === 429) {
          setError(getMessage("login.error.rateLimited"));
        } else {
          setError(getMessage("login.error.unexpected"));
        }
      } else if (err instanceof TypeError) {
        setError(getMessage("login.error.networkUnreachable"));
      } else {
        setError(getMessage("login.error.unexpected"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName =
    "w-full border-b border-border bg-transparent px-0 py-2 text-sm outline-none transition-colors duration-[var(--duration-instant)] placeholder:text-text-subtle/40 focus:border-primary";
  const isRegisterMode = mode === "register";
  const emailFieldId = isRegisterMode ? "register-email" : "email";
  const passwordFieldId = isRegisterMode ? "new-password" : "current-password";
  const passwordFieldName = isRegisterMode
    ? "new-password"
    : "current-password";

  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface p-6",
        className,
      )}
    >
      <div className="grid w-full max-w-2xl gap-16 md:grid-cols-2 md:items-center">
        {/* Left column — ontology narrative */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <img
                src="/copilot-logo.svg"
                alt="Senticor Project"
                className="h-6 w-6"
              />
              <span className="font-mono text-sm text-text-muted">
                Senticor Project
              </span>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">
              Procedural intelligence for legally accountable, AI-supported
              administration.
            </p>
          </div>

          <dl className="space-y-4">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title}>
                <dt className="flex gap-3 text-sm font-medium text-text">
                  <Icon
                    name={d.icon}
                    size={16}
                    className="mt-0.5 shrink-0 text-text-subtle"
                  />
                  {d.title}
                </dt>
                <dd className="pl-7 text-xs leading-relaxed text-text-muted">
                  {d.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right column — login form */}
        <div className="space-y-4">
          {/* Dev/demo disclaimer banner */}
          <div
            role="status"
            className="flex items-start gap-2 rounded-sm bg-status-warning/10 px-4 py-2 text-sm text-status-warning"
          >
            <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">
              {getMessage("disclaimer.dev.banner")}
            </span>
          </div>

          {/* Offline banner */}
          {!isOnline && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-sm bg-status-error/10 px-4 py-2 text-sm text-status-error"
            >
              <Icon name="cloud_off" size={16} className="shrink-0" />
              <span>{getMessage("login.status.offline")}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" key={mode}>
            <h2 className="text-sm font-medium text-text">
              {mode === "login" ? "Sign in to continue" : "Create account"}
            </h2>

            {error && (
              <div className="space-y-1">
                <p role="alert" className="text-xs text-status-error">
                  <Icon
                    name="error"
                    size={12}
                    className="relative -top-px mr-1 inline-block"
                  />
                  {error}
                </p>
                <button
                  type="submit"
                  className="text-xs text-blueprint-600 hover:text-blueprint-700"
                >
                  {getMessage("login.retry")}
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor={emailFieldId}
                  className="mb-1 block text-xs text-text-muted"
                >
                  Email
                </label>
                <input
                  id={emailFieldId}
                  name="email"
                  type="email"
                  autoComplete={isRegisterMode ? "email" : "username"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor={passwordFieldId}
                  className="mb-1 block text-xs text-text-muted"
                >
                  Password
                </label>
                <input
                  key={mode}
                  id={passwordFieldId}
                  name={passwordFieldName}
                  type="password"
                  autoComplete={
                    isRegisterMode ? "new-password" : "current-password"
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClassName}
                  placeholder={
                    mode === "register" ? "Min. 8 characters" : "••••••••"
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !isOnline}
              className={cn(
                "flex w-full items-center justify-between rounded-sm",
                "bg-blueprint-600 px-3 py-1.5 text-sm text-white",
                "transition-colors duration-[var(--duration-fast)]",
                "hover:bg-blueprint-700 disabled:opacity-50",
              )}
            >
              <span className="flex items-center gap-2">
                {isSubmitting && (
                  <Icon
                    name="progress_activity"
                    size={14}
                    className="animate-spin"
                  />
                )}
                {!isSubmitting && (
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      isOnline ? "bg-status-success" : "bg-status-error",
                    )}
                  />
                )}
                {mode === "login" ? "Sign in" : "Create account"}
              </span>
              {!isSubmitting && (
                <kbd
                  aria-hidden="true"
                  className="hidden rounded-sm bg-black/10 px-1.5 py-0.5 font-mono text-[10px] leading-none pointer-fine:inline"
                >
                  Enter
                </kbd>
              )}
            </button>

            {/* Mode toggle — administrative tone */}
            <p className="pt-1 text-[11px] text-text-subtle">
              {mode === "login" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  className="text-text-subtle hover:text-text-muted"
                >
                  Request access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-text-subtle hover:text-text-muted"
                >
                  Sign in
                </button>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
