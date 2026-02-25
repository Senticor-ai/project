import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailApi } from "@/lib/api-client";
import type {
  EmailProposalDecisionResponse,
  EmailProposalResponse,
} from "@/lib/api-client";
import { EMAIL_CONNECTIONS_QUERY_KEY } from "./use-email-connections";

export const EMAIL_PROPOSALS_QUERY_KEY = ["email-proposals"];

export function useEmailProposals(enabled = true) {
  return useQuery<EmailProposalResponse[]>({
    queryKey: EMAIL_PROPOSALS_QUERY_KEY,
    queryFn: () => EmailApi.listProposals(),
    enabled,
    staleTime: 15_000,
  });
}

function useProposalMutation(
  mutationFn: (proposalId: string) => Promise<EmailProposalDecisionResponse>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: EMAIL_PROPOSALS_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: EMAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}

export function useGenerateEmailProposals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EmailApi.generateProposals(),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: EMAIL_PROPOSALS_QUERY_KEY });
    },
  });
}

export function useConfirmEmailProposal() {
  return useProposalMutation((proposalId) => EmailApi.confirmProposal(proposalId));
}

export function useDismissEmailProposal() {
  return useProposalMutation((proposalId) => EmailApi.dismissProposal(proposalId));
}
