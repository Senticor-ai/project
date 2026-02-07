import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface ContextFilterBarProps {
  contexts: string[];
  selectedContexts: string[];
  actionCounts: Record<string, number>;
  onToggleContext: (context: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ContextFilterBar({
  contexts,
  selectedContexts,
  actionCounts,
  onToggleContext,
  onClearAll,
  className,
}: ContextFilterBarProps) {
  if (contexts.length === 0) return null;

  const hasSelection = selectedContexts.length > 0;

  return (
    <div
      role="group"
      aria-label="Filter by context"
      className={cn("flex items-center gap-1.5 overflow-x-auto", className)}
    >
      {contexts.map((ctx) => {
        const isSelected = selectedContexts.includes(ctx);
        return (
          <button
            key={ctx}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`${ctx} (${actionCounts[ctx] ?? 0})`}
            onClick={() => onToggleContext(ctx)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              isSelected
                ? "border-blueprint-300 bg-blueprint-50 text-blueprint-700"
                : "border-border text-text-muted hover:bg-paper-100",
            )}
          >
            <Icon name="label" size={12} />
            <span>{ctx}</span>
            <span
              className={cn(
                "ml-0.5 text-[10px]",
                isSelected ? "text-blueprint-500" : "text-text-subtle",
              )}
            >
              {actionCounts[ctx] ?? 0}
            </span>
          </button>
        );
      })}

      {hasSelection && (
        <button
          type="button"
          onClick={onClearAll}
          aria-label="Clear context filters"
          className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-xs text-text-muted hover:bg-paper-100"
        >
          <Icon name="close" size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
