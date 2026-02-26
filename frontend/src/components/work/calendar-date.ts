function normalizeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    // Validate timezone identifiers and normalize aliases.
    return Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function datePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }
  return { year, month, day };
}

export function resolveViewerTimeZone(): string {
  return normalizeTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );
}

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function dayKeyFromDate(
  date: Date,
  timeZone: string = resolveViewerTimeZone(),
): string {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function dayKeyFromValue(
  value: string | null | undefined,
  timeZone: string = resolveViewerTimeZone(),
): string {
  const date = parseCalendarDate(value);
  if (!date) return "Unscheduled";
  return dayKeyFromDate(date, timeZone);
}

