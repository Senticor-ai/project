import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    email: string,
    username: string,
    password: string,
  ) => Promise<void>;
  /** For storybook: pre-populate error state */
  initialError?: string;
  className?: string;
}

export function LoginPage({
  onLogin,
  onRegister,
  initialError,
  className,
}: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
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
        await onRegister(email, username, password);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface p-4",
        className,
      )}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <img src="/tay-logo.svg" alt="TAY" className="h-12 w-12" />
          <h1 className="font-mono text-2xl font-bold text-blueprint-700">
            terminandoyo
          </h1>
          <p className="text-xs text-text-muted">GTD-native task management</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-[var(--radius-lg)] bg-surface-raised p-6"
        >
          <h2 className="text-center text-sm font-semibold text-text">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>

          {error && (
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <Icon name="error" size={14} />
              {error}
            </div>
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
                className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>

            {mode === "register" && (
              <div>
                <label
                  htmlFor="username"
                  className="mb-1 block text-xs text-text-muted"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="yourname"
                />
              </div>
            )}

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
                className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm"
                placeholder="Min 8 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)]",
              "bg-blueprint-600 px-4 py-2 text-sm font-medium text-white",
              "transition-colors duration-[var(--duration-fast)]",
              "hover:bg-blueprint-700 disabled:opacity-50",
            )}
          >
            {isSubmitting && (
              <Icon
                name="progress_activity"
                size={16}
                className="animate-spin"
              />
            )}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>

          <p className="text-center text-xs text-text-subtle">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  className="font-medium text-blueprint-600 hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="font-medium text-blueprint-600 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
