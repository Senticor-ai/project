import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailApi } from "@/lib/api-client";
import type {
  EmailConnectionResponse,
  EmailConnectionUpdateRequest,
} from "@/lib/api-client";

export const EMAIL_CONNECTIONS_QUERY_KEY = ["email-connections"];

export function useEmailConnections() {
  return useQuery<EmailConnectionResponse[]>({
    queryKey: EMAIL_CONNECTIONS_QUERY_KEY,
    queryFn: () => EmailApi.listConnections(),
    staleTime: 30_000,
    // Poll every 30s when any connection has auto-sync enabled
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasAutoSync = data?.some((c) => c.sync_interval_minutes > 0);
      return hasAutoSync ? 30_000 : false;
    },
  });
}

export function useUpdateEmailConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: EmailConnectionUpdateRequest;
    }) => EmailApi.updateConnection(id, patch),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: EMAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}

export function useTriggerEmailSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => EmailApi.triggerSync(connectionId),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: EMAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}

export function useDisconnectEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => EmailApi.disconnect(connectionId),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: EMAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}
