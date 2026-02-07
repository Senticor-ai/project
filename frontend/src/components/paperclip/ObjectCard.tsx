import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BucketBadge } from "./BucketBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { AttachmentChip } from "./AttachmentChip";
import type {
  GtdBucket,
  ConfidenceLevel,
  TypedReference,
} from "@/model/gtd-types";

export interface ObjectCardProps {
  title: string;
  subtitle?: string;
  bucket: GtdBucket;
  confidence: ConfidenceLevel;
  needsEnrichment: boolean;
  attachments?: Array<TypedReference & { targetTitle: string }>;
  isFocused?: boolean;
  onSelect?: () => void;
  onDetachReference?: (targetId: string) => void;
  interactive?: boolean;
  showBucketBadge?: boolean;
  showConfidenceBadge?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function ObjectCard({
  title,
  subtitle,
  bucket,
  confidence,
  needsEnrichment,
  attachments = [],
  isFocused = false,
  onSelect,
  onDetachReference,
  interactive = true,
  showBucketBadge = true,
  showConfidenceBadge = true,
  className,
  children,
}: ObjectCardProps) {
  return (
    <motion.div
      className={cn(
        "group relative rounded-[var(--radius-lg)] border border-border bg-surface-raised p-4",
        "cursor-pointer select-none",
        "shadow-[var(--shadow-card)]",
        "transition-colors duration-[var(--duration-fast)]",
        isFocused && "ring-2 ring-gtd-focus/40",
        className,
      )}
      whileHover={{
        y: -2,
        boxShadow:
          "0 4px 12px oklch(0.20 0 0 / 0.10), 0 2px 4px oklch(0.20 0 0 / 0.06)",
      }}
      transition={{
        duration: 0.15,
        ease: [0.2, 0.8, 0.2, 1],
      }}
      onClick={onSelect}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      {/* Header row: bucket badge + confidence */}
      {(showBucketBadge || showConfidenceBadge) && (
        <div className="mb-2 flex items-center justify-between">
          {showBucketBadge ? <BucketBadge bucket={bucket} /> : <span />}
          {showConfidenceBadge && (
            <ConfidenceBadge
              confidence={confidence}
              needsEnrichment={needsEnrichment}
            />
          )}
        </div>
      )}

      {/* Title */}
      <h3 className="text-sm font-semibold leading-snug text-text">{title}</h3>

      {/* Subtitle */}
      {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}

      {/* Attachments (typed references) */}
      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {attachments.map((att) => (
            <AttachmentChip
              key={`${att.type}-${att.targetId}`}
              referenceType={att.type}
              targetTitle={att.targetTitle}
              onDetach={
                onDetachReference
                  ? () => onDetachReference(att.targetId)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Slot for additional content */}
      {children}
    </motion.div>
  );
}
