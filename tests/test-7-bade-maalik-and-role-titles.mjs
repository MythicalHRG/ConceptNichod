import assert from "node:assert";
import test from "node:test";

const SPECIAL_TITLES = {
  anurag: "Bade Maalik",
  rohit: "Bade Maalik",
};

const ADMIN_USERNAME = "mythicalhrg";

function getSpecialTitle(username) {
  if (!username) return null;
  const clean = username.replace(/^@/, "").toLowerCase().trim();
  return SPECIAL_TITLES[clean] || null;
}

function checkAdminAccess(username) {
  if (!username) return false;
  return username.toLowerCase().trim() === ADMIN_USERNAME;
}

test("Tareeka 7: @anurag and @rohit receive the 'Bade Maalik' title case-insensitively", () => {
  const anuragVariants = ["anurag", "Anurag", "ANURAG", "@anurag", "@Anurag"];
  const rohitVariants = ["rohit", "Rohit", "ROHIT", "@rohit", "@Rohit"];

  for (const variant of anuragVariants) {
    assert.strictEqual(getSpecialTitle(variant), "Bade Maalik");
  }
  for (const variant of rohitVariants) {
    assert.strictEqual(getSpecialTitle(variant), "Bade Maalik");
  }
});

test("Tareeka 7: Other users do NOT get the 'Bade Maalik' title", () => {
  const otherUsers = ["mythicalhrg", "student123", "rahul", "john_doe", "neha"];
  for (const u of otherUsers) {
    assert.strictEqual(getSpecialTitle(u), null);
  }
});

test("Tareeka 7: Bade Maalik title-holders have standard access, ONLY mythicalhrg has Admin privileges", () => {
  assert.strictEqual(checkAdminAccess("anurag"), false, "anurag must NOT have admin access!");
  assert.strictEqual(checkAdminAccess("rohit"), false, "rohit must NOT have admin access!");
  assert.strictEqual(checkAdminAccess("mythicalhrg"), true, "mythicalhrg MUST have admin access!");
});
