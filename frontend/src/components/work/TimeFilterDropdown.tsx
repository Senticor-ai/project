import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { TimeEstimate } from "@/model/types";

const TIME_OPTIONS: { value: TimeEstimate; label: string }[] = [
  { value: "5min", label: "5 min" },
  { value: "15min", label: "15 min" },
  { value: "30min", label: "30 min" },
  { value: "1hr", label: "1 hr" },
  { value: "2hr", label: "2 hr" },
  { value: "half-day", label: "Half day" },
];

export interface TimeFilterDropdownProps {
  maxTimeEstimate: TimeEstimate | null;
  onChangeMaxTime: (estimate: TimeEstimate | null) => void;
  className?: string;
}

export function TimeFilterDropdown({
  maxTimeEstimate,
  onChangeMaxTime,
  className,
}: TimeFilterDropdownProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <label
        htmlFor="time-filter"
        className="flex items-center gap-1 text-xs text-text-muted"
      >
        <Icon name="schedule" size={12} />
        Time available
      </label>
      <select
        id="time-filter"
        aria-label="Time available"
        value={maxTimeEstimate ?? ""}
        onChange={(e) =>
          onChangeMaxTime(
            e.target.value === ""
              ? null
              : (e.target.value as TimeEstimate),
          )
        }
        className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
      >
        <option value="">Any time</option>
        {TIME_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
