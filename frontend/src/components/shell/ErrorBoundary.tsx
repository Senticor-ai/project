import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.history.replaceState(null, "", "/workspace/inbox");
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface p-6">
          <div className="max-w-md rounded-[var(--radius-md)] border border-border bg-surface-raised p-8 text-center shadow-[var(--shadow-sheet)]">
            <Icon
              name="error"
              size={48}
              className="mx-auto mb-4 text-status-error"
            />
            <h1 className="mb-2 text-lg font-semibold text-text">
              Something went wrong
            </h1>
            <p className="mb-6 text-sm text-text-muted">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                Try again
              </button>
              <button
                onClick={this.handleGoHome}
                className="rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-paper-100"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
