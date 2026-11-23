import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("Batch 14: legacy donation rejection is atomic and does not validate missing legacy fields", () => {
  const actions = read("src/app/actions/donation.ts");
  const reject = actions.slice(actions.indexOf("export async function adminRejectDonationTransaction"), actions.indexOf("\nexport async function adminUpdateDonationSettings"));
  assert.match(reject, /findOneAndUpdate\(/);
  assert.match(reject, /status: "rejected"/);
  assert.match(reject, /isPublishedToPatrons: false/);
  assert.match(reject, /adminNote: rejectionNote/);
  assert.doesNotMatch(reject, /tx\.save\(\)/);
  assert.doesNotMatch(reject, /runValidators:\s*true/);
  assert.match(reject, /Donor\.findByIdAndUpdate[\s\S]*?isVisible: false[\s\S]*?isPublic: false/);
});

test("Batch 14: legacy verification keeps bank evidence and atomic anti-double-verify lock", () => {
  const actions = read("src/app/actions/donation.ts");
  const verify = actions.slice(actions.indexOf("export async function adminVerifyDonationAndSetAmount"), actions.indexOf("\nexport async function adminToggleHallOfPatrons"));
  assert.match(verify, /findOneAndUpdate\([\s\S]*?status: "pending"/);
  assert.match(verify, /bankReference/);
  assert.match(verify, /submitted 12-digit UTR/);
  assert.match(verify, /recipientVpa/);
  assert.match(verify, /verifiedAmount: confirmedAmount/);
  assert.match(verify, /name: \(tx\.donorName \|\| ""\)\.trim\(\) \|\| \(tx\.username \? `@\$\{tx\.username\}` : "Supporter"\)/);
  assert.doesNotMatch(verify, /tx\.save\(\)/);
  assert.match(verify, /findByIdAndUpdate\(tx\._id, \{ \$set: \{ donorRecordId: tx\.donorRecordId \} \}\)/);
});

test("Batch 14: donation pages use semantic themes and no raw Android-sensitive rupee glyphs", () => {
  for (const file of ["src/components/admin/donation-reconciliation.tsx", "src/app/donate/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /bg-slate-950|bg-slate-900|border-slate-800/);
    assert.doesNotMatch(source, /₹/);
  }
  const reconciliation = read("src/components/admin/donation-reconciliation.tsx");
  assert.match(reconciliation, /<Rupee\s*\/>/);
  assert.match(reconciliation, /INR 5,000\+/);
  assert.match(reconciliation, /INR 2,000\+/);
  assert.match(reconciliation, /INR 500\+/);
  assert.match(reconciliation, /INR 100\+/);
});

test("Batch 14: admin deletion and donation decisions use Dialogs instead of native confirm", () => {
  for (const file of ["src/components/admin/donation-reconciliation.tsx", "src/components/admin/admin-panel.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /\bconfirm\s*\(/);
    assert.match(source, /<Dialog/);
  }
});

test("Batch 14: speaker defaults above mobile navigation and resets old saved positions", () => {
  const speaker = read("src/components/ui/background-music.tsx");
  assert.match(speaker, /cn_music_btn_pos_v2/);
  assert.match(speaker, /bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  assert.match(speaker, /window\.innerWidth < 768 \? 84 : 0/);
  assert.match(speaker, /md:right-\[7\.5rem\]/);
});

test("Batch 14: profile removes verbose owner banners while server protection remains", () => {
  const profile = read("src/components/auth/user-profile-button.tsx");
  assert.doesNotMatch(profile, /Platform Owner Email Protected|Platform Owner Account Protected|cannot be changed via self-service|permanently protected and cannot be deleted/);
  const admin = read("src/app/actions/admin.ts");
  assert.match(admin, /isPlatformOwner\(userToDelete\)/);
  assert.match(admin, /The root platform owner email cannot be changed/);
});

test("Batch 14: dashboard displays the shared logo with Zirconel and no KRYOT", () => {
  const dashboard = read("src/app/dashboard/page.tsx");
  assert.match(dashboard, /<Logo className="size-8" \/>/);
  assert.match(dashboard, />Zirconel</);
  assert.doesNotMatch(dashboard, /KRYOT/i);
});

test("Batch 14: owner action modules self-heal the canonical owner role before authorization", () => {
  for (const file of [
    "src/app/actions/donation.ts",
    "src/app/actions/admin.ts",
    "src/app/actions/broadcast.ts",
    "src/app/actions/email-broadcast.ts",
    "src/app/actions/changelog.ts",
    "src/app/actions/study-groups.ts",
  ]) {
    const source = read(file);
    assert.match(source, /ensurePlatformOwnerRole/);
    assert.match(source, /select\("uuid username email role"\)/);
  }
});
