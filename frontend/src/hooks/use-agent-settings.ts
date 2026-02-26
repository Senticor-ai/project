import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentApi, type AgentSettingsUpdateRequest } from "@/lib/api-client";

export const AGENT_SETTINGS_QUERY_KEY = ["agent-settings"];
export const AGENT_CONTAINER_STATUS_KEY = ["agent-container-status"];

export function useAgentSettings() {
  return useQuery({
    queryKey: AGENT_SETTINGS_QUERY_KEY,
    queryFn: () => AgentApi.getSettings(),
  });
}

export function useUpdateAgentSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentSettingsUpdateRequest) =>
      AgentApi.updateSettings(data),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_SETTINGS_QUERY_KEY,
      });
    },
  });
}

export function useDeleteAgentApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => AgentApi.deleteApiKey(),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_SETTINGS_QUERY_KEY,
      });
    },
  });
}

export function useAgentContainerStatus(enabled: boolean) {
  return useQuery({
    queryKey: AGENT_CONTAINER_STATUS_KEY,
    queryFn: () => AgentApi.getContainerStatus(),
    enabled,
    refetchInterval: 5000,
  });
}

export function useStopContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => AgentApi.stopContainer(),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_SETTINGS_QUERY_KEY,
      });
      await queryClient.invalidateQueries({
        queryKey: AGENT_CONTAINER_STATUS_KEY,
      });
    },
  });
}

export function useRestartContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => AgentApi.restartContainer(),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_SETTINGS_QUERY_KEY,
      });
      await queryClient.invalidateQueries({
        queryKey: AGENT_CONTAINER_STATUS_KEY,
      });
    },
  });
}

export function useHardRefreshContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => AgentApi.hardRefreshContainer(),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_SETTINGS_QUERY_KEY,
      });
      await queryClient.invalidateQueries({
        queryKey: AGENT_CONTAINER_STATUS_KEY,
      });
    },
  });
}
