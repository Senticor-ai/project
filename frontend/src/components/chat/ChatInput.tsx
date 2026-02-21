import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { Icon } from "@/components/ui/Icon";

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  agentName?: string;
  className?: string;
}

export function ChatInput({
  onSend,
  disabled,
  agentName = "Copilot",
  className,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, onSend]);

  return (
    <div className={cn("flex items-end gap-2", className)}>
      <AutoGrowTextarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onSubmit={handleSubmit}
        submitOnEnter
        disabled={disabled}
        aria-label={`Nachricht an ${agentName}`}
        placeholder="Nachricht eingeben..."
        className="min-h-10 flex-1 rounded-lg border border-paper-300 bg-white px-3 py-2 text-sm focus:border-blueprint-400 focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Senden"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blueprint-500 text-white transition-colors hover:bg-blueprint-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="send" size={18} />
      </button>
    </div>
  );
}
