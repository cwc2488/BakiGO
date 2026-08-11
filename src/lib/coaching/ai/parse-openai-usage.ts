export type OpenAiChatCompletionUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export function parseOpenAiChatCompletionUsage(payload: unknown): OpenAiChatCompletionUsage | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const cachedTokens = Number(
    (usage.prompt_tokens_details as { cached_tokens?: number } | undefined)?.cached_tokens ?? 0,
  );

  return {
    inputTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    cachedInputTokens: Number.isFinite(cachedTokens) ? cachedTokens : 0,
    outputTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}
