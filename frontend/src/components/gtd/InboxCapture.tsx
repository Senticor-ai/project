import { useState, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export interface InboxCaptureProps {
  onCapture: (rawText: string) => void;
  placeholder?: string;
  className?: string;
}

export function InboxCapture({
  onCapture,
  placeholder = "Capture a thought...",
  className,
}: InboxCaptureProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onCapture(trimmed);
    setText("");
    inputRef.current?.focus();
  }, [text, onCapture]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
        "transition-colors duration-[var(--duration-fast)]",
        "hover:bg-paper-100",
        className,
      )}
    >
      <Icon name="add" size={18} className="shrink-0 text-text-subtle" />
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
        aria-label="Capture inbox item"
      />
      {text.trim() && (
        <button
          onClick={handleSubmit}
          className={cn(
            "shrink-0 rounded-[var(--radius-md)] bg-blueprint-500 px-3 py-1 text-xs font-medium text-white",
            "transition-colors duration-[var(--duration-fast)]",
            "hover:bg-blueprint-600",
          )}
        >
          Capture
        </button>
      )}
    </div>
  );
}
