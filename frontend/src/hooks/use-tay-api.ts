import { useCallback } from "react";
import type { ChatCompletionResponse } from "@/model/chat-types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function useTayApi() {
  const sendMessage = useCallback(
    async (
      message: string,
      conversationId: string,
    ): Promise<ChatCompletionResponse> => {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, conversationId }),
      });

      if (!res.ok) {
        throw new Error(`Chat request failed: ${res.status}`);
      }

      return res.json() as Promise<ChatCompletionResponse>;
    },
    [],
  );

  return { sendMessage };
}
