import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type {
  CalendarEventPatchRequest,
  CalendarEventResponse,
  CalendarEventRsvpRequest,
} from "@/lib/api-client";
import {
  dayKeyFromDate,
  dayKeyFromValue,
  parseCalendarDate,
  resolveViewerTimeZone,
} from "./calendar-date";

export type CalendarMode = "list" | "week" | "month";

/** Extended event type that includes optional project_ids and recurring flag. */
type CalendarEvent = CalendarEventResponse & {
  project_ids?: string[];
  recurring?: boolean;
};

export interface CalendarViewProps {
  events: CalendarEvent[];
  isLoading?: boolean;
  className?: string;
  /** Sync error message to display (e.g. permission denied). */
  syncError?: string;
  /** Available projects for filtering and association. */
  projects?: Array<{ id: string; name: string }>;
  onPatchEvent?: (
    canonicalId: string,
    payload: CalendarEventPatchRequest,
  ) => Promise<void> | void;
  onRsvpEvent?: (
    canonicalId: string,
    payload: CalendarEventRsvpRequest,
  ) => Promise<void> | void;
  onDeleteEvent?: (canonicalId: string) => Promise<void> | void;
  /** Called when user clicks the refresh CTA in empty state. */
  onRefresh?: () => void;
  /** Called when user clicks retry on a sync-failed event. */
  onRetrySync?: (canonicalId: string) => void;
}

type EventEditorState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
};

function formatDayLabel(value: string): string {
  if (value === "Unscheduled") return value;
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isAllDay(startDate: string | null): boolean {
  return Boolean(startDate && !startDate.includes("T"));
}

function formatTimeRange(
  startDate: string | null,
  endDate: string | null,
  source?: string,
): string {
  const start = parseCalendarDate(startDate);
  if (!start) return "All day";
  const hasTime = (startDate || "").includes("T");
  if (!hasTime) {
    if (source === "google_calendar") return "All day";
    return "Time not set";
  }
  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  };
  const startLabel = start.toLocaleTimeString([], {
    ...timeFormat,
  });
  const end = parseCalendarDate(endDate);
  if (!end) return startLabel;
  const endLabel = end.toLocaleTimeString([], { ...timeFormat });
  return `${startLabel} - ${endLabel}`;
}

function toLocalDatetimeInput(value: string | null): string {
  const date = parseCalendarDate(value);
  if (!date) return "";
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDatetimeInput(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function plusThirtyMinutes(value: string | null): string | null {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return new Date(date.getTime() + 30 * 60_000).toISOString();
}

function byStartDate(
  a: CalendarEventResponse,
  b: CalendarEventResponse,
): number {
  const aDay = (a.start_date ?? "").slice(0, 10);
  const bDay = (b.start_date ?? "").slice(0, 10);
  if (aDay === bDay) {
    const aAllDay = isAllDay(a.start_date);
    const bAllDay = isAllDay(b.start_date);
    if (aAllDay && !bAllDay) return -1;
    if (!aAllDay && bAllDay) return 1;
  }
  const left =
    parseCalendarDate(a.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const right =
    parseCalendarDate(b.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return left - right;
}

function syncStateClass(
  syncState: CalendarEventResponse["sync_state"],
): string {
  if (syncState === "Synced") return "bg-green-100 text-green-800";
  if (syncState === "Saving") return "bg-blueprint-100 text-blueprint-700";
  if (syncState === "Sync failed") return "bg-red-100 text-red-700";
  return "bg-paper-200 text-text-muted";
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function makeWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(start);
    day.setDate(start.getDate() + idx);
    return day;
  });
}

function makeMonthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, idx) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + idx);
    return day;
  });
}

function eventsForDay(
  events: CalendarEvent[],
  day: Date,
  timeZone: string,
): CalendarEvent[] {
  const dayKey = dayKeyFromDate(day, timeZone);
  return events.filter(
    (event) => dayKeyFromValue(event.start_date, timeZone) === dayKey,
  );
}

function EventPill({
  event,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="w-full rounded-[var(--radius-sm)] border border-paper-300 bg-white px-2 py-1 text-left text-xs text-text-primary transition-colors hover:border-blueprint-300 hover:bg-blueprint-50"
    >
      <div className="truncate font-medium">{event.name}</div>
      <div className="truncate text-[11px] text-text-muted">
        {formatTimeRange(event.start_date, event.end_date, event.source)}
      </div>
    </button>
  );
}

export function CalendarView({
  events,
  isLoading,
  className,
  syncError,
  projects,
  onPatchEvent,
  onRsvpEvent,
  onDeleteEvent,
  onRefresh,
  onRetrySync,
}: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("list");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editor, setEditor] = useState<EventEditorState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [activeProjectFilter, setActiveProjectFilter] = useState<Set<string>>(
    new Set(),
  );
  const viewerTimeZone = useMemo(() => resolveViewerTimeZone(), []);

  const sortedEvents = useMemo(() => [...events].sort(byStartDate), [events]);

  const filteredEvents = useMemo(() => {
    if (activeProjectFilter.size === 0) return sortedEvents;
    return sortedEvents.filter((event) => {
      const projectIds = (event as CalendarEvent).project_ids;
      return projectIds?.some((id) => activeProjectFilter.has(id));
    });
  }, [sortedEvents, activeProjectFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const key = dayKeyFromValue(event.start_date, viewerTimeZone);
      const bucket = groups.get(key) ?? [];
      bucket.push(event);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries());
  }, [filteredEvents, viewerTimeZone]);

  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());

  const navigate = (direction: -1 | 1) => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      if (mode === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const weekDays = useMemo(() => makeWeekDays(anchorDate), [anchorDate]);
  const monthDays = useMemo(() => makeMonthGrid(anchorDate), [anchorDate]);

  const openEvent = (event: CalendarEvent) => {
    setSelected(event);
    setPatchError(null);
    setEditor({
      name: event.name,
      description: event.description || "",
      startDate: toLocalDatetimeInput(event.start_date),
      endDate: toLocalDatetimeInput(event.end_date),
    });
  };

  const handlePatch = async (payload: CalendarEventPatchRequest) => {
    if (!selected || !onPatchEvent) return;
    setBusyKey(`patch:${selected.canonical_id}`);
    setPatchError(null);
    try {
      await onPatchEvent(selected.canonical_id, payload);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        setPatchError(
          "This event was modified elsewhere. Please reload and try again.",
        );
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveEditor = async () => {
    if (!selected || !editor) return;
    await handlePatch({
      name: editor.name,
      description: editor.description || undefined,
      start_date: fromLocalDatetimeInput(editor.startDate) || undefined,
      end_date: fromLocalDatetimeInput(editor.endDate) || undefined,
    });
  };

  const handleQuickReschedule = async () => {
    if (!selected) return;
    const nextStart = plusThirtyMinutes(selected.start_date);
    const nextEnd = plusThirtyMinutes(selected.end_date);
    await handlePatch({
      start_date: nextStart || undefined,
      end_date: nextEnd || undefined,
    });
  };

  const handleRsvp = async (status: CalendarEventRsvpRequest["status"]) => {
    if (!selected || !onRsvpEvent) return;
    setBusyKey(`rsvp:${selected.canonical_id}:${status}`);
    try {
      await onRsvpEvent(selected.canonical_id, { status });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async () => {
    if (!selected || !onDeleteEvent) return;
    setBusyKey(`delete:${selected.canonical_id}`);
    try {
      await onDeleteEvent(selected.canonical_id);
      setSelected(null);
      setEditor(null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-paper-200 bg-paper-50 px-3 py-2">
        <div className="text-sm font-medium text-text-primary">Calendar</div>
        <div className="inline-flex rounded-[var(--radius-md)] border border-paper-300 bg-white p-0.5">
          {(["list", "week", "month"] as const).map((entryMode) => (
            <button
              key={entryMode}
              type="button"
              onClick={() => setMode(entryMode)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium capitalize",
                mode === entryMode
                  ? "bg-blueprint-600 text-white"
                  : "text-text-muted hover:bg-paper-100",
              )}
            >
              {entryMode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={mode === "list"}
            aria-label="Previous"
            className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-xs text-text-muted hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            disabled={mode === "list"}
            className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-xs font-medium text-text-primary hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={mode === "list"}
            aria-label="Next"
            className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-xs text-text-muted hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {/* Project filter bar */}
      {projects && projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveProjectFilter(new Set())}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              activeProjectFilter.size === 0
                ? "bg-blueprint-600 text-white"
                : "bg-paper-100 text-text-muted hover:bg-paper-200",
            )}
          >
            All
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() =>
                setActiveProjectFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(project.id)) {
                    next.delete(project.id);
                  } else {
                    next.add(project.id);
                  }
                  return next;
                })
              }
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                activeProjectFilter.has(project.id)
                  ? "bg-blueprint-600 text-white"
                  : "bg-paper-100 text-text-muted hover:bg-paper-200",
              )}
            >
              {project.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-paper-200 bg-white py-10">
          <Icon
            name="progress_activity"
            className="animate-spin text-text-muted"
          />
        </div>
      )}

      {/* Sync error state */}
      {syncError && (
        <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <Icon name="error" size={16} />
            <span>{syncError}</span>
          </div>
          <a
            href="/settings/email"
            className="mt-2 inline-block text-xs font-medium text-red-700 underline"
          >
            Settings
          </a>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredEvents.length === 0 && !syncError && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-paper-300 bg-paper-50 px-4 py-10 text-center text-sm text-text-muted">
          <p>No upcoming events.</p>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 rounded-[var(--radius-sm)] border border-paper-300 bg-white px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-paper-100"
            >
              Refresh sync
            </button>
          )}
        </div>
      )}

      {!isLoading && filteredEvents.length > 0 && mode === "list" && (
        <div className="space-y-3">
          {grouped.map(([day, dayEvents]) => (
            <section
              key={day}
              className="rounded-[var(--radius-lg)] border border-paper-200 bg-white"
            >
              <header className="border-b border-paper-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {formatDayLabel(day)}
              </header>
              <ul className="divide-y divide-paper-100">
                {dayEvents.map((event) => (
                  <li
                    key={event.canonical_id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => openEvent(event)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium text-text-primary">
                        {event.name}
                      </div>
                      <div className="text-xs text-text-muted">
                        {formatTimeRange(
                          event.start_date,
                          event.end_date,
                          event.source,
                        )}
                      </div>
                    </button>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        syncStateClass(event.sync_state),
                      )}
                    >
                      {event.sync_state}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!isLoading && filteredEvents.length > 0 && mode === "week" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {weekDays.map((day) => {
            const dayEvents = eventsForDay(filteredEvents, day, viewerTimeZone);
            const allDayEvents = dayEvents.filter((e) =>
              isAllDay(e.start_date),
            );
            const timedEvents = dayEvents.filter(
              (e) => !isAllDay(e.start_date),
            );
            return (
              <section
                key={dayKeyFromDate(day, viewerTimeZone)}
                className="rounded-[var(--radius-lg)] border border-paper-200 bg-white"
              >
                <header className="border-b border-paper-100 px-2 py-2 text-xs font-semibold text-text-muted">
                  {day.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </header>
                <div className="p-2">
                  {dayEvents.length === 0 ? (
                    <div className="text-[11px] text-text-muted">No events</div>
                  ) : (
                    <>
                      {allDayEvents.length > 0 && (
                        <div
                          data-testid="all-day-lane"
                          className="mb-1 space-y-1 border-b border-paper-100 pb-1"
                        >
                          {allDayEvents.map((event) => (
                            <EventPill
                              key={event.canonical_id}
                              event={event}
                              onOpen={openEvent}
                            />
                          ))}
                        </div>
                      )}
                      <div className="space-y-2">
                        {timedEvents.map((event) => (
                          <EventPill
                            key={event.canonical_id}
                            event={event}
                            onOpen={openEvent}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!isLoading && filteredEvents.length > 0 && mode === "month" && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          {monthDays.map((day) => {
            const cellEvents = eventsForDay(
              filteredEvents,
              day,
              viewerTimeZone,
            );
            const allDayEventsInCell = cellEvents.filter((e) =>
              isAllDay(e.start_date),
            );
            const timedEventsInCell = cellEvents.filter(
              (e) => !isAllDay(e.start_date),
            );
            const isCurrentMonth = day.getMonth() === anchorDate.getMonth();
            return (
              <section
                key={dayKeyFromDate(day, viewerTimeZone)}
                className={cn(
                  "min-h-24 rounded-[var(--radius-md)] border border-paper-200 p-2",
                  isCurrentMonth ? "bg-white" : "bg-paper-50",
                )}
              >
                <div className="mb-2 text-[11px] font-medium text-text-muted">
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {allDayEventsInCell.length > 0 && (
                    <div
                      data-testid="all-day-lane"
                      className="mb-0.5 border-b border-paper-100 pb-0.5"
                    >
                      {allDayEventsInCell.slice(0, 2).map((event) => (
                        <EventPill
                          key={event.canonical_id}
                          event={event}
                          onOpen={openEvent}
                        />
                      ))}
                    </div>
                  )}
                  {timedEventsInCell
                    .slice(0, 3 - Math.min(allDayEventsInCell.length, 2))
                    .map((event) => (
                      <EventPill
                        key={event.canonical_id}
                        event={event}
                        onOpen={openEvent}
                      />
                    ))}
                  {cellEvents.length > 3 && (
                    <div className="text-[11px] text-text-muted">
                      +{cellEvents.length - 3} more
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected && editor && (
        <aside className="rounded-[var(--radius-lg)] border border-paper-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Event details
            </h3>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setEditor(null);
                setPatchError(null);
              }}
              className="rounded-[var(--radius-sm)] p-1 text-text-muted hover:bg-paper-100"
              aria-label="Close event details"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          {/* Recurrence label */}
          {(selected as CalendarEvent).recurring && (
            <p className="mb-3 rounded-[var(--radius-sm)] bg-amber-50 px-2 py-1 text-xs text-amber-700">
              This occurrence only
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-text-muted">
              Title
              <input
                value={editor.name}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev ? { ...prev, name: e.target.value } : prev,
                  )
                }
                className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-xs text-text-muted">
              Sync
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium",
                  syncStateClass(selected.sync_state),
                )}
              >
                {selected.sync_state}
              </span>
            </label>
            <label className="grid gap-1 text-xs text-text-muted">
              Start
              <input
                type="datetime-local"
                value={editor.startDate}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev ? { ...prev, startDate: e.target.value } : prev,
                  )
                }
                className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-sm text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-xs text-text-muted">
              End
              <input
                type="datetime-local"
                value={editor.endDate}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev ? { ...prev, endDate: e.target.value } : prev,
                  )
                }
                className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-sm text-text-primary"
              />
            </label>
          </div>

          <label className="mt-3 grid gap-1 text-xs text-text-muted">
            Description
            <textarea
              value={editor.description}
              onChange={(e) =>
                setEditor((prev) =>
                  prev ? { ...prev, description: e.target.value } : prev,
                )
              }
              rows={3}
              className="rounded-[var(--radius-sm)] border border-paper-300 px-2 py-1 text-sm text-text-primary"
            />
          </label>

          {/* Project association editor */}
          {projects && projects.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-text-muted">Projects</div>
              <div className="flex flex-wrap gap-1">
                {projects.map((project) => {
                  const isLinked = (
                    selected as CalendarEvent
                  ).project_ids?.includes(project.id);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      disabled={!onPatchEvent || busyKey !== null}
                      onClick={() => {
                        const currentIds =
                          (selected as CalendarEvent).project_ids ?? [];
                        const nextIds = isLinked
                          ? currentIds.filter((id) => id !== project.id)
                          : [...currentIds, project.id];
                        void handlePatch({ project_ids: nextIds });
                      }}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        isLinked
                          ? "bg-app-project/10 text-app-project hover:bg-app-project/20"
                          : "bg-paper-100 text-text-muted hover:bg-paper-200",
                      )}
                    >
                      {project.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conflict error */}
          {patchError && (
            <p className="mt-3 rounded-[var(--radius-sm)] bg-red-50 px-2 py-1 text-xs text-red-700">
              {patchError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveEditor}
              disabled={!onPatchEvent || busyKey !== null}
              className="rounded-[var(--radius-sm)] bg-blueprint-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleQuickReschedule}
              disabled={!onPatchEvent || !selected.writable || busyKey !== null}
              className="rounded-[var(--radius-sm)] border border-paper-300 px-3 py-1.5 text-xs font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              title={
                selected.writable
                  ? "Move event by 30 minutes"
                  : "Event is not writable on Google Calendar"
              }
            >
              +30 min
            </button>
            <button
              type="button"
              onClick={() => handleRsvp("accepted")}
              disabled={!onRsvpEvent || busyKey !== null}
              className="rounded-[var(--radius-sm)] border border-paper-300 px-3 py-1.5 text-xs font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => handleRsvp("tentative")}
              disabled={!onRsvpEvent || busyKey !== null}
              className="rounded-[var(--radius-sm)] border border-paper-300 px-3 py-1.5 text-xs font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tentative
            </button>
            <button
              type="button"
              onClick={() => handleRsvp("declined")}
              disabled={!onRsvpEvent || busyKey !== null}
              className="rounded-[var(--radius-sm)] border border-paper-300 px-3 py-1.5 text-xs font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Decline
            </button>
            {/* Retry button for sync-failed events */}
            {selected.sync_state === "Sync failed" && onRetrySync && (
              <button
                type="button"
                onClick={() => onRetrySync(selected.canonical_id)}
                className="rounded-[var(--radius-sm)] border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
              >
                Retry sync
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={!onDeleteEvent || busyKey !== null}
              className="rounded-[var(--radius-sm)] border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          </div>

          {!selected.writable && selected.provider === "google_calendar" && (
            <p className="mt-3 text-xs text-text-muted">
              This event is attendee-only ({selected.access_role || "reader"}).
              Time edits and hard delete are disabled.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
