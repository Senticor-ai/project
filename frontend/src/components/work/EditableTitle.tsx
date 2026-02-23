import { useRef, useState, useEffect, useCallback, useId } from "react";
import type { NameProvenance } from "@/model/types";
import { cn } from "@/lib/utils";

interface InlineEditableTitleProps {
  variant?: "inline";
  title: string;
  isEditing: boolean;
  onSave?: (newTitle: string) => void;
  onToggleEdit: () => void;
  onDoubleClick?: () => void;
  completed?: boolean;
  /** When provided, sets aria-expanded on the title button (for disclosure pattern). */
  ariaExpanded?: boolean;
  className?: string;
}

interface SplitEditableTitleProps {
  variant: "split";
  name?: string;
  rawCapture?: string;
  nameProvenance?: NameProvenance;
  onRename?: (newName: string) => void;
  className?: string;
}

export type EditableTitleProps =
  | InlineEditableTitleProps
  | SplitEditableTitleProps;

function formatRelativeTime(isoDate: string): string {
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return "just now";
  const deltaMs = Date.now() - ts;
  if (deltaMs <= 0) return "just now";

  const minutes = Math.floor(deltaMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function provenanceLabel(setBy: NameProvenance["setBy"]): string {
  if (setBy === "ai") return "AI suggested";
  if (setBy === "user") return "User edited";
  return "System renamed";
}

function InlineEditableTitle({
  title,
  isEditing,
  onSave,
  onToggleEdit,
  onDoubleClick,
  completed = false,
  ariaExpanded,
  className,
}: InlineEditableTitleProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const exitedViaKeyRef = useRef(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [prevTitle, setPrevTitle] = useState(title);

  // Clear optimistic value once the prop catches up (derived state pattern).
  if (prevTitle !== title) {
    setPrevTitle(title);
    if (optimistic !== null && optimistic === title) {
      setOptimistic(null);
    }
  }

  const displayTitle = optimistic ?? title;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const saveIfChanged = () => {
    const trimmed = inputRef.current?.value.trim();
    if (trimmed && trimmed !== displayTitle) {
      setOptimistic(trimmed);
      onSave?.(trimmed);
    }
  };

  const handleBlur = () => {
    // Skip if already exited via Enter/Escape (prevents double-toggle)
    if (exitedViaKeyRef.current) {
      exitedViaKeyRef.current = false;
      return;
    }
    saveIfChanged();
    onToggleEdit();
  };

  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      exitedViaKeyRef.current = true;
      saveIfChanged();
      onToggleEdit();
    } else if (e.key === "Enter") {
      // Shift+Enter or Alt+Enter: allow newline, then grow
      requestAnimationFrame(() => {
        if (inputRef.current) grow(inputRef.current);
      });
    } else if (e.key === "Escape") {
      e.preventDefault();
      exitedViaKeyRef.current = true;
      if (inputRef.current) {
        inputRef.current.value = displayTitle;
      }
      onToggleEdit();
    }
  };

  if (isEditing) {
    return (
      <textarea
        key={displayTitle}
        ref={inputRef}
        rows={1}
        defaultValue={displayTitle}
        aria-label={`Edit title: ${displayTitle}`}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={(e) => grow(e.currentTarget)}
        className={cn(
          "flex-1 resize-none bg-transparent text-sm font-medium text-text outline-none",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleEdit}
      onDoubleClick={onDoubleClick}
      aria-expanded={ariaExpanded}
      className={cn(
        "flex-1 whitespace-pre-wrap text-left text-sm text-text",
        completed ? "font-normal text-text-muted line-through" : "font-medium",
        className,
      )}
    >
      {displayTitle}
    </button>
  );
}

function SplitEditableTitle({
  name,
  rawCapture,
  nameProvenance,
  onRename,
  className,
}: SplitEditableTitleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const fallbackTitle = name ?? rawCapture ?? "";
  const [draft, setDraft] = useState(fallbackTitle);

  useEffect(() => {
    setDraft(fallbackTitle);
  }, [fallbackTitle]);

  const commitRename = () => {
    const next = draft.trim();
    const current = fallbackTitle.trim();
    if (next !== current) {
      onRename?.(next);
    }
  };

  return (
    <section
      className={cn(
        "mb-3 rounded-[var(--radius-md)] border border-border bg-paper-50 p-3",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className="mb-1 block text-xs font-medium text-text-muted"
      >
        Title (optional)
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        aria-label="Title (optional)"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(fallbackTitle);
            inputRef.current?.blur();
          }
        }}
        placeholder={rawCapture ?? "Add title"}
        className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-sm"
      />

      {nameProvenance && (
        <p className="mt-1 text-xs text-text-muted">
          {provenanceLabel(nameProvenance.setBy)} •{" "}
          {formatRelativeTime(nameProvenance.setAt)}
        </p>
      )}

      <label className="mt-3 mb-1 block text-xs font-medium text-text-muted">
        Captured text
      </label>
      <p
        aria-label="Captured text"
        className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-paper-100 px-2 py-1.5 text-xs text-text"
      >
        {rawCapture?.trim() || "No captured text available"}
      </p>
    </section>
  );
}

export function EditableTitle(props: EditableTitleProps) {
  if (props.variant === "split") {
    return <SplitEditableTitle {...props} />;
  }
  return <InlineEditableTitle {...props} />;
}
