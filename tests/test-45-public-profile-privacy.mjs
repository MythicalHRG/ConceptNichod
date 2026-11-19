import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("public profile data never selects or exposes a user birth date", () => {
  const source = fs.readFileSync("src/app/actions/profile.ts", "utf8");
  const publicQuery = source.slice(source.indexOf("export async function getPublicProfileData("));
  assert.match(publicQuery, /\.select\("[^"]*-dob[^"]*"\)/);
  assert.doesNotMatch(publicQuery, /\.select\("[^"]*\+dob/);
});
