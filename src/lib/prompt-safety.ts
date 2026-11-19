/** Escape user/model-controlled text before embedding it inside prompt delimiters. */
export function escapePromptText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
