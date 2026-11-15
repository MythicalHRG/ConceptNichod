import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { verifyEdgeSessionCookie } from "../src/lib/edge-session.ts";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const secret = "edge-runtime-test-secret-with-at-least-32-bytes";

test("Edge verifier accepts the exact HMAC cookie produced by the Node session signer", async () => {
  const previousSecret = process.env.ENCRYPTION_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    process.env.NODE_ENV = "production";
    process.env.ENCRYPTION_SECRET_KEY = secret;
    const signature = createHmac("sha256", secret).update(uuid).digest("hex");
    assert.equal(await verifyEdgeSessionCookie(`${uuid}.${signature}`), uuid);
    assert.equal(await verifyEdgeSessionCookie(`${uuid}.${"0".repeat(64)}`), null);
    assert.equal(await verifyEdgeSessionCookie("not-a-session"), null);
  } finally {
    if (previousSecret === undefined) delete process.env.ENCRYPTION_SECRET_KEY;
    else process.env.ENCRYPTION_SECRET_KEY = previousSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: previousCrypto });
  }
});
