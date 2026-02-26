import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CollaborationApi,
  type ProjectActionCommentRequest,
  type ProjectActionCreateRequest,
  type ProjectActionListRequest,
  type ProjectActionTransitionRequest,
  type ProjectActionUpdateRequest,
} from "@/lib/api-client";

const COLLABORATION_KEY = ["collaboration"] as const;

function byProject(projectId: string) {
  return [...COLLABORATION_KEY, "project", projectId] as const;
}

function invalidateProjectCollaboration(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  void queryClient.invalidateQueries({ queryKey: byProject(projectId) });
}

export function useProjectWorkflow(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...byProject(projectId ?? "none"), "workflow"],
    queryFn: () => CollaborationApi.getProjectWorkflow(projectId ?? ""),
    enabled: enabled && Boolean(projectId),
    staleTime: 60_000,
  });
}

export function useProjectMembers(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...byProject(projectId ?? "none"), "members"],
    queryFn: () => CollaborationApi.listProjectMembers(projectId ?? ""),
    enabled: enabled && Boolean(projectId),
    staleTime: 30_000,
  });
}

export function useProjectActions(
  projectId: string | null,
  params?: ProjectActionListRequest,
  enabled = true,
) {
  const normalizedParams = useMemo(
    () => ({
      status: params?.status ?? [],
      tag: params?.tag ?? null,
      owner_user_id: params?.owner_user_id ?? null,
      due_before: params?.due_before ?? null,
      due_after: params?.due_after ?? null,
    }),
    [
      params?.status,
      params?.tag,
      params?.owner_user_id,
      params?.due_before,
      params?.due_after,
    ],
  );

  return useQuery({
    queryKey: [...byProject(projectId ?? "none"), "actions", normalizedParams],
    queryFn: () =>
      CollaborationApi.listProjectActions(projectId ?? "", {
        status: normalizedParams.status,
        tag: normalizedParams.tag ?? undefined,
        owner_user_id: normalizedParams.owner_user_id ?? undefined,
        due_before: normalizedParams.due_before ?? undefined,
        due_after: normalizedParams.due_after ?? undefined,
      }),
    enabled: enabled && Boolean(projectId),
  });
}

export function useProjectActionDetail(
  projectId: string | null,
  actionId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [...byProject(projectId ?? "none"), "action", actionId ?? "none"],
    queryFn: () => CollaborationApi.getProjectAction(projectId ?? "", actionId ?? ""),
    enabled: enabled && Boolean(projectId) && Boolean(actionId),
  });
}

export function useProjectActionHistory(
  projectId: string | null,
  actionId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...byProject(projectId ?? "none"),
      "action-history",
      actionId ?? "none",
    ],
    queryFn: () =>
      CollaborationApi.getProjectActionHistory(projectId ?? "", actionId ?? ""),
    enabled: enabled && Boolean(projectId) && Boolean(actionId),
  });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; role?: string }) =>
      CollaborationApi.addProjectMember(projectId, payload),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) =>
      CollaborationApi.removeProjectMember(projectId, targetUserId),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}

export function useCreateProjectAction(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectActionCreateRequest) =>
      CollaborationApi.createProjectAction(projectId, payload),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}

export function useUpdateProjectAction(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
      payload,
    }: {
      actionId: string;
      payload: ProjectActionUpdateRequest;
    }) => CollaborationApi.updateProjectAction(projectId, actionId, payload),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}

export function useTransitionProjectAction(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
      payload,
    }: {
      actionId: string;
      payload: ProjectActionTransitionRequest;
    }) => CollaborationApi.transitionProjectAction(projectId, actionId, payload),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}

export function useAddProjectActionComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
      payload,
    }: {
      actionId: string;
      payload: ProjectActionCommentRequest;
    }) => CollaborationApi.addProjectActionComment(projectId, actionId, payload),
    onSuccess: () => {
      invalidateProjectCollaboration(queryClient, projectId);
    },
  });
}
