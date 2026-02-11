import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatApi } from "@/lib/api-client";
import { ITEMS_QUERY_KEY } from "./use-items";
import type { TaySuggestion, CreatedItemRef } from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";

export function useTayActions() {
  const queryClient = useQueryClient();

  const executeSuggestion = useCallback(
    async (
      suggestion: TaySuggestion,
      conversationId: string,
    ): Promise<CreatedItemRef[]> => {
      const response = await ChatApi.executeTool({
        toolCall: {
          name: suggestion.type,
          arguments: suggestion as unknown as Record<string, unknown>,
        },
        conversationId,
      });

      await queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });

      return response.createdItems.map((item) => ({
        canonicalId: item.canonicalId as CanonicalId,
        name: item.name,
        type: item.type,
      }));
    },
    [queryClient],
  );

  return { executeSuggestion };
}
