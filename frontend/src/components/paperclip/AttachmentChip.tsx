import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { ReferenceType } from "@/model/gtd-types";

const refConfig: Record<
  ReferenceType,
  { label: string; icon: string; className: string }
> = {
  blocks: {
    label: "Blocks",
    icon: "block",
    className: "border-red-300 bg-red-50 text-red-700",
  },
  depends_on: {
    label: "Depends on",
    icon: "account_tree",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  delegates_to: {
    label: "Delegated to",
    icon: "person_check",
    className: "border-purple-300 bg-purple-50 text-purple-700",
  },
  refers_to: {
    label: "Refers to",
    icon: "link",
    className: "border-paper-400 bg-paper-100 text-text-muted",
  },
  context_of: {
    label: "Context",
    icon: "label",
    className: "border-blueprint-300 bg-blueprint-50 text-blueprint-700",
  },
  part_of: {
    label: "Part of",
    icon: "extension",
    className: "border-blueprint-300 bg-blueprint-50 text-blueprint-600",
  },
  follows: {
    label: "Follows",
    icon: "arrow_forward",
    className: "border-paper-400 bg-paper-100 text-text-muted",
  },
  waiting_on: {
    label: "Waiting on",
    icon: "hourglass_bottom",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
};

export interface AttachmentChipProps {
  referenceType: ReferenceType;
  targetTitle: string;
  onDetach?: () => void;
  className?: string;
}

export function AttachmentChip({
  referenceType,
  targetTitle,
  onDetach,
  className,
}: AttachmentChipProps) {
  const config = refConfig[referenceType];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        "transition-all duration-[var(--duration-fast)]",
        config.className,
        className,
      )}
    >
      <Icon name={config.icon} size={12} />
      <span className="max-w-32 truncate">{targetTitle}</span>
      {onDetach && (
        <button
          onClick={onDetach}
          className="ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
          aria-label={`Detach ${targetTitle}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
