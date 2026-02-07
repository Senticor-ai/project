import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface EditableTitleProps {
  title: string;
  isEditing: boolean;
  onSave?: (newTitle: string) => void;
  onToggleEdit: () => void;
  completed?: boolean;
  className?: string;
}

export function EditableTitle({
  title,
  isEditing,
  onSave,
  onToggleEdit,
  completed = false,
  className,
}: EditableTitleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const optimisticRef = useRef<string | null>(null);

  // Clear optimistic value once the prop catches up
  if (optimisticRef.current !== null && optimisticRef.current === title) {
    optimisticRef.current = null;
  }

  const displayTitle = optimisticRef.current ?? title;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const saveIfChanged = () => {
    const trimmed = inputRef.current?.value.trim();
    if (trimmed && trimmed !== displayTitle) {
      optimisticRef.current = trimmed;
      onSave?.(trimmed);
    }
  };

  const handleBlur = () => {
    saveIfChanged();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveIfChanged();
      onToggleEdit();
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
      <input
        key={displayTitle}
        ref={inputRef}
        defaultValue={displayTitle}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex-1 bg-transparent text-sm font-medium text-text outline-none",
          className,
        )}
      />
    );
  }

  return (
    <button
      onClick={onToggleEdit}
      className={cn(
        "flex-1 truncate text-left text-sm text-text",
        completed ? "font-normal text-text-muted line-through" : "font-medium",
        className,
      )}
    >
      {displayTitle}
    </button>
  );
}
