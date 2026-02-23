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
      const toolArguments =
        suggestion.type === "copilot_cli"
          ? { argv: suggestion.argv }
          : (suggestion as unknown as Record<string, unknown>);

      const response = await ChatApi.executeTool({
        toolCall: {
          name: suggestion.type,
          arguments: toolArguments,
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

  const onItemsChanged = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
  }, [queryClient]);

  return { executeSuggestion, onItemsChanged };
}
