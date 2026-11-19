const INVISIBLE_PROMPT_CHARS = /[\u0000\u{E0000}-\u{E007F}]/gu;

/** Escape user/model-controlled text before embedding it inside prompt delimiters. */
export function escapePromptText(value: string): string {
  return String(value ?? "").replace(INVISIBLE_PROMPT_CHARS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}