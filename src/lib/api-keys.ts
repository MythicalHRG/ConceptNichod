/**
 * Legacy API keys helper — all AI operations now use OpenRouter via src/lib/openrouter.ts.
 */
export function getGeminiApiKeyForTopic(_topicId: string): string {
  return process.env.OPENROUTER_API_KEY || "";
}
