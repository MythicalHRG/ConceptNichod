import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("manual donation donor sync uses a stable transaction-derived identity", () => {
  const source = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  assert.match(source, /createHash\("sha256"\)\.update\(\`conceptnichod:donation:\$\{tx\._id\}\`\)/);
  assert.match(source, /findOneAndUpdate\(\s*\{ uuid: donorUuid \}/);
  assert.match(source, /donorError\?\.code !== 11000/);
  assert.match(source, /\$setOnInsert: \{ uuid: donorUuid \}/);
});

test("verified donation can resume only an incomplete patron sync without changing its amount", () => {
  const source = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  assert.match(source, /tx\.status === "verified" && Boolean\(tx\.isPublishedToPatrons\) && !tx\.donorRecordId/);
  assert.match(source, /Number\(tx\.verifiedAmount\) !== confirmedAmount/);
  assert.match(source, /if \(!isDonorSyncRecovery\)\s*\{[\s\S]*?findOneAndUpdate/);
  assert.match(source, /Keep the bank-verified status if patron sync fails/);
  assert.doesNotMatch(source, /status: "pending"\s*\},\s*\$unset:\s*\{ verifiedAt/);
});
