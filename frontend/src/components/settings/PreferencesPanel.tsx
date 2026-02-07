import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type {
  UserPreferences,
  Language,
  TimeFormat,
  DateFormat,
  WeekStart,
  ThemePreference,
} from "@/model/settings-types";
import type { Bucket } from "@/model/types";

export interface PreferencesPanelProps {
  preferences: UserPreferences;
  onChange: (update: Partial<UserPreferences>) => void;
  className?: string;
}

const labelClass = "mb-1 flex items-center gap-1 text-xs text-text-muted";
const selectClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[var(--radius-sm)] border px-2 py-1 text-xs",
            value === opt.value
              ? "border-blueprint-400 bg-blueprint-50 font-medium text-blueprint-700"
              : "border-border hover:bg-paper-100",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PreferencesPanel({
  preferences,
  onChange,
  className,
}: PreferencesPanelProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Language & Regional */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          Language & Regional
        </h3>

        <div>
          <label htmlFor="pref-language" className={labelClass}>
            <Icon name="translate" size={10} />
            Language
          </label>
          <select
            id="pref-language"
            aria-label="Language"
            value={preferences.language}
            onChange={(e) => onChange({ language: e.target.value as Language })}
            className={selectClass}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>
            <Icon name="schedule" size={10} />
            Time format
          </label>
          <ToggleGroup
            options={[
              { value: "24h" as TimeFormat, label: "24h" },
              { value: "12h" as TimeFormat, label: "12h" },
            ]}
            value={preferences.timeFormat}
            onChange={(v) => onChange({ timeFormat: v })}
          />
        </div>

        <div>
          <label htmlFor="pref-date-format" className={labelClass}>
            <Icon name="calendar_month" size={10} />
            Date format
          </label>
          <select
            id="pref-date-format"
            aria-label="Date format"
            value={preferences.dateFormat}
            onChange={(e) =>
              onChange({ dateFormat: e.target.value as DateFormat })
            }
            className={selectClass}
          >
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          </select>
        </div>

        <div>
          <label htmlFor="pref-week-start" className={labelClass}>
            <Icon name="view_week" size={10} />
            Week start
          </label>
          <select
            id="pref-week-start"
            aria-label="Week start"
            value={preferences.weekStart}
            onChange={(e) =>
              onChange({ weekStart: e.target.value as WeekStart })
            }
            className={selectClass}
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </div>
      </section>

      {/* Display */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">Display</h3>

        <div>
          <label htmlFor="pref-default-bucket" className={labelClass}>
            <Icon name="home" size={10} />
            Default view
          </label>
          <select
            id="pref-default-bucket"
            aria-label="Default view"
            value={preferences.defaultBucket}
            onChange={(e) =>
              onChange({ defaultBucket: e.target.value as Bucket })
            }
            className={selectClass}
          >
            <option value="inbox">Inbox</option>
            <option value="focus">Focus</option>
            <option value="next">Next Actions</option>
            <option value="project">Projects</option>
            <option value="waiting">Waiting For</option>
            <option value="calendar">Calendar</option>
            <option value="someday">Someday/Maybe</option>
            <option value="reference">Reference</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>
            <Icon name="palette" size={10} />
            Theme
          </label>
          <ToggleGroup
            options={[
              { value: "light" as ThemePreference, label: "Light" },
              { value: "system" as ThemePreference, label: "System" },
              { value: "dark" as ThemePreference, label: "Dark" },
            ]}
            value={preferences.theme}
            onChange={(v) => onChange({ theme: v })}
          />
        </div>
      </section>

      {/* GTD Review */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">GTD Review</h3>

        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={preferences.weeklyReviewEnabled}
            onChange={(e) =>
              onChange({ weeklyReviewEnabled: e.target.checked })
            }
            aria-label="Weekly review reminder"
          />
          Weekly review reminder
        </label>

        {preferences.weeklyReviewEnabled && (
          <div>
            <label htmlFor="pref-review-day" className={labelClass}>
              <Icon name="event_repeat" size={10} />
              Review day
            </label>
            <select
              id="pref-review-day"
              aria-label="Review day"
              value={preferences.weeklyReviewDay}
              onChange={(e) => onChange({ weeklyReviewDay: e.target.value })}
              className={selectClass}
            >
              <option value="monday">Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
        )}
      </section>
    </div>
  );
}
