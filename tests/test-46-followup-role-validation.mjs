import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("follow-up action rejects forged roles and keeps user context out of system instructions", () => {
  const source = fs.readFileSync("src/app/actions/followup.ts", "utf8");
  assert.match(source, /message\.role !== "user" && message\.role !== "assistant"/);
  assert.match(source, /message\.content\.length > 5000/);
  assert.match(source, /role: "system" as const, content: systemMessage/);
  assert.match(source, /role: "user" as const, content: contextMessage/);
  assert.doesNotMatch(source, /const systemMessage = isGrillMode[\s\S]{0,1500}\$\{safeTopic\}/);
});
