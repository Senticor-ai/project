import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { ConfidenceLevel } from "@/model/gtd-types";

const confidenceConfig: Record<
  ConfidenceLevel | "enrichment",
  { label: string; icon: string; className: string }
> = {
  high: {
    label: "Clarified",
    icon: "check_circle",
    className: "text-confidence-high",
  },
  medium: {
    label: "Partial",
    icon: "radio_button_checked",
    className: "text-confidence-medium",
  },
  low: {
    label: "Raw",
    icon: "error",
    className: "text-confidence-low",
  },
  enrichment: {
    label: "Needs review",
    icon: "auto_awesome",
    className: "text-confidence-enrichment",
  },
};

export interface ConfidenceBadgeProps {
  confidence: ConfidenceLevel;
  needsEnrichment: boolean;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBadge({
  confidence,
  needsEnrichment,
  showLabel = false,
  className,
}: ConfidenceBadgeProps) {
  const key = needsEnrichment ? "enrichment" : confidence;
  const config = confidenceConfig[key];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        config.className,
        className,
      )}
      title={config.label}
    >
      <Icon name={config.icon} size={14} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
