import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { EnergyLevel } from "@/model/types";

export interface EnergyFilterBarProps {
  selectedEnergy: EnergyLevel | null;
  onToggleEnergy: (level: EnergyLevel) => void;
  className?: string;
}

export function EnergyFilterBar({
  selectedEnergy,
  onToggleEnergy,
  className,
}: EnergyFilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter by energy"
      className={cn("flex items-center gap-1.5", className)}
    >
      {(["low", "medium", "high"] as const).map((level) => {
        const isSelected = selectedEnergy === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={level}
            onClick={() => onToggleEnergy(level)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs capitalize transition-colors",
              isSelected
                ? "border-blueprint-400 bg-blueprint-50 font-medium text-blueprint-700"
                : "border-border text-text-muted hover:bg-paper-100",
            )}
          >
            <Icon name="speed" size={12} />
            <span>{level}</span>
          </button>
        );
      })}
    </div>
  );
}
