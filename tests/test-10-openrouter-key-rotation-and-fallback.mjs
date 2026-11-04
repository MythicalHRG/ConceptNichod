import assert from "node:assert";
import test from "node:test";

class OpenRouterKeyRotator {
  constructor(keys) {
    this.keys = keys;
    this.currentIndex = 0;
  }

  getNextKey() {
    if (this.keys.length === 0) throw new Error("No keys available");
    const key = this.keys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    return key;
  }

  onRateLimit(currentKey) {
    // If a key hits 429, advance to next key
    return this.getNextKey();
  }
}

test("Tareeka 10: Multi-key rotation cycles sequentially through the key pool", () => {
  const rotator = new OpenRouterKeyRotator(["key_alpha", "key_beta", "key_gamma"]);

  assert.strictEqual(rotator.getNextKey(), "key_alpha");
  assert.strictEqual(rotator.getNextKey(), "key_beta");
  assert.strictEqual(rotator.getNextKey(), "key_gamma");
  assert.strictEqual(rotator.getNextKey(), "key_alpha"); // Wrapped around
});

test("Tareeka 10: When a key is exhausted (429), it switches to the next available key", () => {
  const rotator = new OpenRouterKeyRotator(["key_1", "key_2", "key_3"]);

  const first = rotator.getNextKey(); // key_1
  assert.strictEqual(first, "key_1");

  // Simulate 429 rate limit on key_1
  const fallback = rotator.onRateLimit(first);
  assert.strictEqual(fallback, "key_2");
});
