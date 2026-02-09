import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface EditableTitleProps {
  title: string;
  isEditing: boolean;
  onSave?: (newTitle: string) => void;
  onToggleEdit: () => void;
  completed?: boolean;
  /** When provided, sets aria-expanded on the title button (for disclosure pattern). */
  ariaExpanded?: boolean;
  className?: string;
}

export function EditableTitle({
  title,
  isEditing,
  onSave,
  onToggleEdit,
  completed = false,
  ariaExpanded,
  className,
}: EditableTitleProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [prevTitle, setPrevTitle] = useState(title);

  // Clear optimistic value once the prop catches up (derived state pattern)
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
    saveIfChanged();
  };

  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      saveIfChanged();
      onToggleEdit();
    } else if (e.key === "Enter") {
      // Shift+Enter or Alt+Enter: allow newline, then grow
      requestAnimationFrame(() => {
        if (inputRef.current) grow(inputRef.current);
      });
    } else if (e.key === "Escape") {
      e.preventDefault();
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
      onClick={onToggleEdit}
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
