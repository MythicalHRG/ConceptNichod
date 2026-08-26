/**
 * Retrieves a deterministic API key for a given topic ID to avoid hitting rate limits.
 * It expects GEMINI_API_KEY_1, GEMINI_API_KEY_2, and GEMINI_API_KEY_3 in the environment.
 */
export function getGeminiApiKeyForTopic(topicId: string): string {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter((key): key is string => Boolean(key));

  if (keys.length === 0) {
    throw new Error("No Gemini API keys found in the environment. Please add GEMINI_API_KEY_1.");
  }

  // Simple string hash to pick an index deterministically
  let hash = 0;
  for (let i = 0; i < topicId.length; i++) {
    hash = topicId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Make sure the hash is positive
  const positiveHash = Math.abs(hash);
  const index = positiveHash % keys.length;

  return keys[index];
}
