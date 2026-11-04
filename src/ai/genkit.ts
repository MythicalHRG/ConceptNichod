import { genkit } from 'genkit';

// Genkit is kept as a minimal stub so any residual imports don't break.
// All AI calls now go through OpenRouter (src/lib/openrouter.ts).
export const ai = genkit({ plugins: [] });
