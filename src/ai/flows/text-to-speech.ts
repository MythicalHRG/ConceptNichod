import 'server-only';
// text-to-speech.ts — Uses browser's built-in TTS on client side.
// Server-side TTS via Google was removed (required Genkit).
// The actual speech is handled client-side via window.speechSynthesis.
// This file is kept as a server-only stub so existing server action imports don't break.

export async function textToSpeech(_text: string): Promise<{ media: string }> {
  // This function should not be called server-side anymore.
  // TTS is handled client-side in the SummaryDisplay component.
  throw new Error("Server-side TTS is not available. Use browser Speech Synthesis API instead.");
}
