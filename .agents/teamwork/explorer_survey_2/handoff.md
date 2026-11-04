# Handoff Report: Backend, Auth, Security & Data Survey

**Agent**: Explorer 2 (Backend, Auth, Security & Data Explorer)  
**Recipient**: Parent Orchestrator (`868fe768-f07c-4616-b21b-e5f568021534`)  
**Artifact File**: `c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\explorer_survey_2\analysis.md`  
**Date**: 2026-11-04  
**Type**: Hard Handoff (Investigation & Survey Complete)

---

## 1. Observation

1. **Authentication Session Structure & Exposure**:
   - In `src/app/actions/auth.ts:127-133` and `src/app/actions/auth.ts:184-190`:
     The session cookie `user_session` is set to raw `uuid`:
     `cookies().set("user_session", user.uuid, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });`
   - In `src/app/actions/aspirants.ts:48-61`:
     `searchAspirantsAction` maps and returns `uuid: u.uuid`:
     ```typescript
     return users.map((u: any) => ({
         uuid: u.uuid,
         username: u.username,
         ...
     ```
   - In `src/app/actions/admin.ts:10-18`:
     `verifyAdmin()` inspects `cookies().get("user_session")?.value`, then looks up `User.findOne({ uuid: sessionUuid })`. If `user.username === "mythicalhrg"`, admin privileges are granted.

2. **User Schema & IP/Timestamp Tracking**:
   - In `src/models/User.ts:19, 39`:
     Only `lastKnownIp?: string` is defined in `IUser` and `UserSchema`.
     `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, and `lastLoginAt` do NOT exist.
   - In `src/app/actions/auth.ts:121`:
     `registerAction` only stores `lastKnownIp: ip`.
   - In `src/app/actions/auth.ts:178`:
     `loginAction` only updates `user.lastKnownIp = ip`.
   - In `src/components/admin/admin-panel.tsx:324, 347`:
     The admin table only shows a single "IP Address" column rendering `{u.lastKnownIp || "Unknown"}`.

3. **Public Data Leakage via Profile Action**:
   - In `src/app/actions/profile.ts:12`:
     `const user = await User.findOne({ username: ... }).select("-password -email -uuid -_id -createdAt -__v");`
     IP fields (`lastKnownIp`, and newly added `firstLoginIp`, `lastLoginIp`, etc.) are NOT projected out and will be exposed to anyone querying public profiles.

4. **Academic Class Level "12+" Omissions**:
   - In `src/components/auth/login-dialog.tsx:453`:
     Class dropdown options: `["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "Dropper"]`.
   - In `src/components/auth/login-dialog.tsx:461`:
     Conditional exam target selector only triggers for:
     `{['Class 11', 'Class 12', 'Dropper'].includes(classLevel) && (`
   - In `src/components/auth/user-profile-button.tsx:351`:
     Class dropdown: `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper", "Other"]`.
   - In `src/app/dashboard/aspirants-connect/page.tsx:86`:
     Filter dropdown: `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper"]`.
   - In `src/components/dashboard/add-topic-button.tsx:33-37`:
     `indianClasses = ["Class 1", ..., "Class 12"]`.
   - In `src/components/concept-mirror/mastery-dashboard.tsx:316`:
     Hardcoded `classLevel="Class 11-12"`.

5. **Security Gaps on Endpoints & Actions**:
   - `src/app/api/auth/otp/route.ts:10-96`:
     Cooldown is 60s per-email, but NO IP-based rate limiting exists. Banned IPs and banned emails are not checked against `Blacklist`. `validateEmailDomain` is not enforced on send, allowing open email relay.
   - `src/app/actions/auth.ts:142-200`:
     `loginAction` has zero rate limiting or failed attempt lockouts.
   - `src/app/api/generate/analysis/route.ts` & `src/app/api/generate/content/route.ts`:
     No Zod body validation; unauthenticated calls throw 500 instead of 401; no rate limiting on expensive LLM calls.
   - `src/middleware.ts:4-24`:
     Matcher only checks `/dashboard/:path*`; only checks `!sessionCookie` without verifying signature or tampering. No defensive HTTP headers set.

6. **Automated Test & Build Baseline**:
   - `npm test` (`node --test tests/*.mjs`): 33 of 33 tests pass cleanly in 1845ms.
   - `npm run typecheck` (`tsc --noEmit`): Exits with code 0 (0 errors).
   - `npm run build` (`next build`): Completed successfully with code 0.

---

## 2. Logic Chain

1. **Account Takeover Vulnerability (Critical)**:
   - Observation 1 demonstrates that `user_session` cookie value is the raw `uuid`, and `searchAspirantsAction` explicitly returns `uuid` for other users.
   - Because `verifyAdmin()` grants root admin access purely based on `user.uuid === sessionUuid`, an attacker who searches for `mythicalhrg` in Aspirants Connect can copy the returned `uuid`, set their `user_session` cookie to that `uuid`, and instantly gain full root admin privileges.
   - *Conclusion*: Redacting `uuid` from all public endpoints and cryptographically signing the `user_session` cookie with HMAC-SHA256 (`<uuid>.<hmac>`) is an urgent, non-negotiable security requirement.

2. **Data Isolation of IP & Timestamp Tracking**:
   - Observation 2 shows that only `lastKnownIp` exists and neither first/last login timestamps nor first login IP are tracked.
   - Observation 3 shows that `getPublicProfileData` excludes only `-password -email -uuid -_id -createdAt -__v`.
   - If `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, and `lastLoginAt` are added to the User document without updating `getPublicProfileData`'s `.select(...)`, MongoDB will include those fields in the public profile JSON response.
   - *Conclusion*: Adding these fields to `IUser` and `UserSchema`, recording them in `registerAction` and `loginAction`, displaying them in the Admin panel table, AND explicitly excluding them from `getPublicProfileData` satisfies Requirement R4 with strict security isolation.

3. **Academic Class Level "12+" Coverage**:
   - Observation 4 confirms that "12+" is missing across five critical components: registration dropdown, profile edit dropdown, Aspirants Connect filter dropdown, Add Topic classes, and Concept Mirror analysis.
   - In addition, line 461 in `login-dialog.tsx` excludes "12+" from selecting target competitive exams (IIT JEE, NEET, UPSC), directly degrading UX for post-12th / dropper students.
   - *Conclusion*: Updating all dropdown arrays to include `"12+"`, updating the competitive exam check to include `'12+'`, ensuring `searchAspirantsAction` matches `"12+"`, and connecting user class level to Concept Mirror fully fulfills Requirement R5.

4. **Defensive Hardening (Rate Limiting, Input Validation, Blacklist Enforcement)**:
   - Observation 5 reveals brute-force susceptibility on `loginAction`, email relay abuse on `/api/auth/otp`, unauthenticated 500 errors on generation routes, and HTML injection in email templates.
   - *Conclusion*: Introducing an in-memory sliding-window rate limiter (`src/lib/rate-limiter.ts`), checking `Blacklist` and `validateEmailDomain` in `/api/auth/otp`, escaping HTML in email actions, and validating route bodies with Zod hardens the entire backend.

---

## 3. Caveats

1. **In-Memory Rate Limiting vs Distributed Cache**:
   - The proposed sliding-window rate limiter uses in-memory storage (`src/lib/rate-limiter.ts`). If deployed across a multi-instance serverless cluster without shared Redis, rate limits are enforced per-container rather than globally. However, for a standalone Next.js deployment, this provides sub-millisecond, zero-dependency protection without requiring an external Redis infrastructure.
2. **Backward Compatibility of Existing User Sessions**:
   - Upgrading `user_session` to `<uuid>.<signature>` will gracefully sign out users with legacy unsigned cookies upon next request, prompting them to log in once to receive a signed session.

---

## 4. Conclusion

The backend architecture is clean and performs well, but requires four critical defensive implementations:
1. **Session & Security Hardening**: Cryptographic session HMAC signing, redaction of `uuid` from `searchAspirantsAction`, and sliding-window rate limiting on login, registration, OTP, and AI generation.
2. **IP & Timestamp Tracking**: Add `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` to `User` schema; record on registration/login; expose in Admin Panel; strictly exclude from public profile projections.
3. **Academic Class Level "12+"**: Add `"12+"` to all dropdowns, competitive exam conditionals, Aspirants Connect filters, and Concept Mirror flows.
4. **Endpoint Hardening**: Enforce `Blacklist` checks and email domain validation on `/api/auth/otp`; add Zod validation to API routes; escape HTML in email templates; add HTTP security headers.

All detailed file-by-file blueprints and line references are documented in `c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\explorer_survey_2\analysis.md`.

---

## 5. Verification Method

1. **Automated Unit & Security Tests**:
   - Run existing suite: `npm test` (`node --test tests/*.mjs`) -> Must maintain 33/33 pass rate (0 failures).
   - Write and run new verification tests in `tests/`:
     - `test-15-ip-tracking-admin-isolation.mjs`
     - `test-16-academic-class-12-plus.mjs`
     - `test-17-session-hmac-and-uuid-redaction.mjs`
     - `test-18-rate-limiting-defense.mjs`
     - `test-19-otp-domain-and-blacklist-defense.mjs`
2. **TypeScript Typecheck**:
   - Command: `npm run typecheck` (`tsc --noEmit`) -> Must exit with code 0.
3. **Production Build**:
   - Command: `npm run build` (`next build`) -> Must compile with zero errors.
4. **Invalidation Conditions**:
   - Any failure of existing 33 tests.
   - Any exposure of `uuid`, `firstLoginIp`, or `lastLoginIp` in `searchAspirantsAction` or `getPublicProfileData`.
   - Any omission of `"12+"` from registration, profile edit, or Aspirants Connect filtering.
