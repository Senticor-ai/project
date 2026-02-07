import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

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
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName =
    "w-full border-b border-border bg-transparent px-0 py-2 text-sm outline-none transition-colors duration-[var(--duration-instant)] placeholder:text-text-subtle/40 focus:border-primary";

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
              <img src="/tay-logo.svg" alt="TAY" className="h-6 w-6" />
              <span className="font-mono text-sm text-text-muted">
                terminandoyo
              </span>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">
              Procedural intelligence for legally accountable, AI-supported
              administration.
            </p>
          </div>

          <dl className="space-y-4">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title} className="flex gap-3">
                <Icon
                  name={d.icon}
                  size={16}
                  className="mt-0.5 shrink-0 text-text-subtle"
                />
                <div>
                  <dt className="text-sm font-medium text-text">{d.title}</dt>
                  <dd className="text-xs leading-relaxed text-text-muted">
                    {d.description}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        {/* Right column — login form */}
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-medium text-text">
              {mode === "login" ? "Sign in to continue" : "Create account"}
            </h2>

            {error && (
              <p className="text-xs text-red-700">
                <Icon
                  name="error"
                  size={12}
                  className="relative -top-px mr-1 inline-block"
                />
                {error}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-xs text-text-muted"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-xs text-text-muted"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
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
              disabled={isSubmitting}
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
                {mode === "login" ? "Sign in" : "Create account"}
              </span>
              {!isSubmitting && (
                <kbd className="rounded-sm bg-white/20 px-1.5 py-0.5 font-mono text-[10px] leading-none">
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
