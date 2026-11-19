import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("cron cleanup compares fixed-length token digests with timingSafeEqual and fails closed", () => {
  const source = fs.readFileSync("src/app/api/cron/cleanup/route.ts", "utf8");
  assert.match(source, /import \{ createHash, timingSafeEqual \} from "crypto"/);
  assert.match(source, /if \(!cronSecret \|\| !suppliedToken\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual\(expectedDigest, suppliedDigest\)/);
  assert.doesNotMatch(source, /authHeader\s*!==\s*`Bearer \$\{cronSecret\}`/);
});

test("cron deletes only rows that remain expired at the atomic delete operation", () => {
  const source = fs.readFileSync("src/app/api/cron/cleanup/route.ts", "utf8");
  assert.match(source, /expiresAt: \{ \$lt: cleanupCutoff \}/);
  assert.match(source, /Broadcast\.findOne\(\{ _id: candidate\._id, expiresAt: \{ \$lt: cleanupCutoff \} \}\)/);\n  assert.match(source, /Broadcast\.deleteOne\(\{ _id: broadcast\._id, expiresAt: \{ \$lt: cleanupCutoff \} \}\)/);\n  assert.ok(source.indexOf("utapi.deleteFiles") < source.indexOf("Broadcast.deleteOne"), "remote file deletion must happen before row deletion");
  assert.match(source, /\.limit\(100\)/);
  assert.match(source, /fileUrl\.protocol === "https:" && isAllowedHost/);
});
