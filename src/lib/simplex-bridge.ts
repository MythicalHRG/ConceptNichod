import { timingSafeEqual } from "crypto";

type BridgeResponse = Record<string, unknown>;

function bridgeConfig() {
  const baseUrl = process.env.SIMPLEX_BRIDGE_URL;
  const secret = process.env.SIMPLEX_BRIDGE_SECRET;
  if (!baseUrl || !secret) return null;
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("The SimpleX bridge must use HTTPS.");
  }
  if (secret.length < 32) throw new Error("SIMPLEX_BRIDGE_SECRET must be at least 32 characters.");
  return { baseUrl: url.toString().replace(/\/$/, ""), secret };
}

export function isSimplexBridgeConfigured() {
  return bridgeConfig() !== null;
}

async function bridgePost(path: string, body: Record<string, unknown>): Promise<BridgeResponse> {
  const config = bridgeConfig();
  if (!config) throw new Error("The SimpleX bridge is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.secret}` },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("The SimpleX bridge could not complete the request.");
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The SimpleX bridge returned an invalid response.");
    return result as BridgeResponse;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("The SimpleX bridge timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createSimplexAccountLink(userId: string) {
  const response = await bridgePost("/v1/account-links", { userId });
  if (typeof response.contactLink !== "string" || typeof response.linkCode !== "string") throw new Error("The SimpleX bridge returned an invalid link.");
  return { contactLink: response.contactLink, linkCode: response.linkCode };
}

export async function createSimplexConversation(conversationId: string, participantIds: string[]) {
  const response = await bridgePost("/v1/conversations", { conversationId, participantIds });
  if (typeof response.simplexConversationId !== "string") throw new Error("The SimpleX bridge did not create the conversation.");
  return response.simplexConversationId;
}

export async function deliverSimplexMessage(input: { messageId: string; conversationId: string; senderId: string; senderUsername: string; recipientId: string; body: string; expiresAt: string }) {
  await bridgePost("/v1/messages", input);
}

export function verifySimplexWebhookSecret(value: string | null) {
  const expected = process.env.SIMPLEX_BRIDGE_WEBHOOK_SECRET;
  if (!expected || expected.length < 32 || !value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

