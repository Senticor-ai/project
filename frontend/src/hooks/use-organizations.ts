import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrgsApi } from "@/lib/api-client";
import type { OrgResponse } from "@/lib/api-client";

export const ORGS_QUERY_KEY = ["organizations"];

export function useOrganizations() {
  return useQuery<OrgResponse[]>({
    queryKey: ORGS_QUERY_KEY,
    queryFn: () => OrgsApi.list(),
    staleTime: 60_000,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => OrgsApi.create(name),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY });
    },
  });
}
