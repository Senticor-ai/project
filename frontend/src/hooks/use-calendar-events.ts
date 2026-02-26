import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarApi,
  type CalendarEventPatchRequest,
  type CalendarEventResponse,
  type CalendarEventRsvpRequest,
} from "@/lib/api-client";
import { ITEMS_QUERY_KEY } from "./use-items";

export const CALENDAR_EVENTS_QUERY_KEY = ["calendar-events"] as const;

function randomIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function invalidateRelated(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: CALENDAR_EVENTS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
}

export function useCalendarEvents(enabled = true) {
  return useQuery({
    queryKey: CALENDAR_EVENTS_QUERY_KEY,
    queryFn: () => CalendarApi.listEvents({ limit: 800 }),
    enabled,
    staleTime: 15_000,
  });
}

export function usePatchCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      canonicalId,
      payload,
    }: {
      canonicalId: string;
      payload: CalendarEventPatchRequest;
    }) =>
      CalendarApi.patchEvent(
        canonicalId,
        payload,
        randomIdempotencyKey("calendar-patch"),
      ),
    onSuccess: () => invalidateRelated(queryClient),
  });
}

export function useSetCalendarEventRsvp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      canonicalId,
      payload,
    }: {
      canonicalId: string;
      payload: CalendarEventRsvpRequest;
    }) =>
      CalendarApi.setRsvp(
        canonicalId,
        payload,
        randomIdempotencyKey("calendar-rsvp"),
      ),
    onSuccess: () => invalidateRelated(queryClient),
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (canonicalId: string) =>
      CalendarApi.deleteEvent(
        canonicalId,
        randomIdempotencyKey("calendar-delete"),
      ),
    onSuccess: () => invalidateRelated(queryClient),
  });
}

export function mergeCalendarEvents(
  apiEvents: CalendarEventResponse[] | undefined,
  fallbackEvents: Array<{
    id: string;
    name?: string;
    description?: string;
    source?: string;
    startDate?: string;
    scheduledDate?: string;
  }>,
): CalendarEventResponse[] {
  if (apiEvents && apiEvents.length > 0) {
    return apiEvents;
  }
  return fallbackEvents.map((item) => {
    const startDate = item.startDate || item.scheduledDate || null;
    return {
      item_id: item.id,
      canonical_id: item.id,
      name: item.name || "(Untitled)",
      description: item.description || null,
      start_date: startDate,
      end_date: null,
      source: item.source || "manual",
      provider: item.source === "google_calendar" ? "google_calendar" : null,
      calendar_id: null,
      event_id: null,
      access_role: null,
      writable: true,
      rsvp_status: null,
      sync_state: item.source === "google_calendar" ? "Synced" : "Local only",
      updated_at: new Date().toISOString(),
    };
  });
}
