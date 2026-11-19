const INVISIBLE_PROMPT_CHARS = /[\u0000\u{E0000}-\u{E007F}]/gu;

export function escapeUntrustedPromptContext(text: string): string {
  return String(text ?? "")
    .replace(INVISIBLE_PROMPT_CHARS, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
