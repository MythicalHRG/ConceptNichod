import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
test("logout returns to the public landing page and opens sign-in", () => {
  const auth = read("src/components/auth/auth-context.tsx");
  assert.match(auth, /await logoutAction\(\)/);
  assert.match(auth, /setUser\(null\)/);
  assert.match(auth, /setAuthModalOpen\(true\)/);
  assert.match(auth, /window\.location\.replace\("\/\?login=true"\)/);
});
test("switching accounts navigates to the new dashboard and refreshes server data", () => {
  const auth = read("src/components/auth/auth-context.tsx");
  assert.match(auth, /const login = useCallback\(\(newUser: AuthUser\)/);
  assert.match(auth, /userRef\.current = newUser/);
  assert.match(auth, /window\.location\.replace\("\/dashboard"\)/);
});
test("unauthenticated protected-route requests return to landing page with sign-in intent", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /if \(!verifiedSessionUuid && isProtected\)/);
  assert.match(middleware, /url\.pathname = '\/'/);
  assert.match(middleware, /url\.search = '\?login=true'/);
  for (const route of ["/dashboard", "/aspirants-connect", "/study-groups", "/leaderboard"]) {
    assert.ok(middleware.includes(route), `Missing protected route: ${route}`);
  }
});
test("dashboard and topic detail queries are scoped to the authenticated UUID", () => {
  const dashboard = read("src/app/dashboard/page.tsx");
  const topicPage = read("src/app/dashboard/topic/[topicId]/page.tsx");
  assert.match(dashboard, /Topic\.find\(\{ userId: user\.uuid \}\)/);
  assert.match(topicPage, /Topic\.findOne\(\{ _id: topicId, userId: sessionUuid \}\)/);
});
test("topic mutation actions enforce authenticated ownership in database filters", () => {
  const actions = read("src/app/actions.ts");
  assert.match(actions, /Topic\.findOne\(\{ _id: topicId, userId: sessionUuid \}\)/);
  assert.match(actions, /Topic\.findOneAndUpdate\(\s*\{ _id: topicId, userId: sessionUuid \}/);
  assert.match(actions, /Topic\.findOne\(\{ _id: topicId, userId: sessionUuid \}\)/);
});
test("private server entry points validate session version against the database", () => {
  const helper = read("src/lib/session-auth.ts");
  const signer = read("src/lib/session.ts");
  assert.match(helper, /getSessionVersionFromCookie/);
  assert.match(helper, /User\.findOne\(\{ uuid \}\)\.select\("sessionVersion"\)/);
  assert.match(helper, /effectiveTokenVersion === currentVersion/);
  assert.match(signer, /SESSION_TTL_SECONDS/);
  assert.match(signer, /expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)/);
  for (const path of [
    "src/app/actions.ts",
    "src/app/actions/auth.ts",
    "src/app/actions/mistakes.ts",
    "src/app/actions/study-groups.ts",
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/layout.tsx",
    "src/app/dashboard/topic/[topicId]/page.tsx",
  ]) {
    assert.match(read(path), /getVerifiedSessionUuid/ , `Missing DB-backed session validation in ${path}`);
    assert.doesNotMatch(read(path), /verifySessionCookie\(/, `Legacy verification bypass remains in ${path}`);
  }
});
test("password changes rotate the current session and revoke previous session versions", () => {
  const auth = read("src/app/actions/auth.ts");
  assert.match(auth, /\$inc: \{ sessionVersion: 1 \}/);
  assert.match(auth, /createSignedSessionCookie\(user\.uuid, nextSessionVersion\)/);
});
test("account changes invalidate stale private UI in other browser tabs", () => {
  const auth = read("src/components/auth/auth-context.tsx");
  assert.match(auth, /BroadcastChannel\(AUTH_SYNC_CHANNEL\)/);
  assert.match(auth, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(auth, /window\.location\.replace\(message\.type === "logout" \? "\/\?login=true" : "\/dashboard"\)/);
  assert.match(auth, /announceAuthChange\("login"\)/);
  assert.match(auth, /announceAuthChange\("logout"\)/);
});