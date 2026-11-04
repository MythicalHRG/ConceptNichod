# Forensic Integrity Audit Report: Milestone 1

**Agent**: Forensic Integrity Auditor (Milestone 1)  
**Recipient**: Parent Orchestrator (`868fe768-f07c-4616-b21b-e5f568021534`)  
**Working Directory**: `c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\auditor_m1_1`  
**Date**: 2026-11-04  
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md:8`)  
**Verdict**: **CLEAN**

---

## 1. Observation

### Static Analysis of Modified Deliverables
1. **`src/models/User.ts` (Lines 19-23, 43-47, 51-56)**:
   - `IUser` interface defines `firstLoginIp?: string;`, `firstLoginAt?: Date;`, `lastLoginIp?: string;`, `lastLoginAt?: Date;`, `lastKnownIp?: string;`.
   - `UserSchema` defines:
     ```typescript
     firstLoginIp: { type: String, required: false },
     firstLoginAt: { type: Date, required: false },
     lastLoginIp: { type: String, required: false },
     lastLoginAt: { type: Date, required: false },
     lastKnownIp: { type: String, required: false },
     ```
   - Added Mongoose query pre-hook on `["find", "findOne", "findOneAndUpdate", "deleteOne", "deleteMany"]` normalizing `uuid` queries containing `.` (e.g. `<uuid>.<signature>` session cookies).
   - No hardcoded test strings or dummy constants.

2. **`src/lib/session.ts` (Lines 9-50)**:
   - `createSignedSessionCookie(uuid: string)` creates HMAC-SHA256 signature via `crypto.createHmac("sha256", SECRET).update(uuid).digest("hex")` and formats cookie as `${uuid}.${signature}`.
   - `verifySessionCookie(cookieValue?: string | null)` parses `${uuid}.${signature}`, re-computes `expectedSignature`, converts both to `Buffer`, and performs timing-safe comparison:
     ```typescript
     sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
     ```
   - Preserves rolling migration fallback for valid unsigned UUIDs matching `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
   - Genuine cryptographic implementation; no facade or mock bypasses.

3. **`src/lib/rate-limiter.ts` (Lines 8-114)**:
   - Uses an in-memory sliding window `Map<string, number[]>` storing timestamps.
   - `checkRateLimit(key, limit, windowMs)` filters entries within sliding window `t > windowStart`, computes `resetMs = Math.max(0, oldestInWindow + windowMs - now)`, returns `remaining = Math.max(0, limit - timestamps.length)`.
   - Automatic LRU cleanup `cleanupOldEntries` runs when map size exceeds 5000 keys.
   - Genuine dynamic calculation without hardcoded response structures.

4. **`src/lib/ip.ts` (Lines 3-94)**:
   - `sanitizeIp(ip: string)` handles null/undefined, normalizes IPv6 localhost (`::1`, `::ffff:127.0.0.1`, `localhost`), strips `::ffff:` IPv4 prefix, validates IPv4 octets `0..255`, extracts structured IPv6, and returns `"127.0.0.1"` for malicious/unparseable input.
   - `getClientIp(customHeaders)` parses proxy headers respecting strict precedence:
     1. `cf-connecting-ip` (Cloudflare)
     2. `x-forwarded-for` (leftmost client IP)
     3. `x-real-ip` (reverse proxy fallback)
     4. Default fallback: `"127.0.0.1"`
   - Uses Next.js `headers()` when `customHeaders` is omitted.

5. **`src/app/actions/auth.ts` (Lines 77-142, 159-222, 240-244, 258-260)**:
   - `registerAction`: captures `getClientIp()`, enforces `checkRateLimit('register:${ip}', 3, 3600000)`, writes `firstLoginIp: ip`, `firstLoginAt: now`, `lastLoginIp: ip`, `lastLoginAt: now`, `lastKnownIp: ip`, and sets signed cookie with `createSignedSessionCookie(uuid)`.
   - `loginAction`: captures `getClientIp()`, checks `peekRateLimit('login:${ip}:${rawInput}', 5, 900000)`, records failed attempts with `recordFailedAttempt`, resets on success with `resetRateLimit`, updates `lastLoginIp` / `lastLoginAt`, backfills `firstLoginIp` / `firstLoginAt` for legacy accounts, and sets signed cookie with `createSignedSessionCookie(user.uuid)`.
   - `meAction`, `updateProfileAction`, `requestEmailChangeOtpAction`, `confirmEmailChangeAction`, `changePasswordAction`, `deleteAccountAction`: all decode and authenticate sessions strictly through `verifySessionCookie(rawSession)`.

6. **`src/app/actions/admin.ts` (Lines 11-29, 31-36)**:
   - `verifyAdmin()` strictly verifies session cookie with `verifySessionCookie(rawSession)` and enforces `user.username === "mythicalhrg"`.
   - `getAllUsersAction()` queries `User.find({}).select("-password")`, securely exposing IP history (`firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`) exclusively to the verified administrator.

7. **`src/app/actions/aspirants.ts` (Lines 16-18, 50-62)**:
   - Authenticates caller using `verifySessionCookie(rawSession)`.
   - Query excludes current user: `{ uuid: { $ne: sessionUuid } }`.
   - Return mapping explicitly removes `uuid`:
     ```typescript
     return users.map((u: any) => ({
       username: u.username,
       fullName: u.fullName,
       gender: u.gender,
       classLevel: u.classLevel,
       examFocus: u.examFocus,
       city: u.city,
       futureCollege: u.futureCollege,
       snapchat: u.snapchat,
       instagram: u.instagram,
       bio: u.bio,
       createdAt: u.createdAt
     }));
     ```
   - Verified: `uuid`, `email`, `password`, `firstLoginIp`, `lastLoginIp` are completely redacted from search results.

8. **`src/app/actions/profile.ts` (Lines 12, 103)**:
   - `getPublicProfileData(username)` query projection:
     ```typescript
     .select("-password -email -uuid -_id -createdAt -__v -firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp")
     ```
   - User UUID is queried separately only to load topic analytics (`Topic.find({ userId: userWithId.uuid })`) and is never leaked to the caller.
   - All IP tracking and login timestamp fields are strictly projected out.

9. **`src/app/api/auth/otp/route.ts` (Lines 31-82, 134-164)**:
   - Resolves IP via `getClientIp(req.headers)`.
   - Enforces `Blacklist` check for IP and email (returns 403 Forbidden).
   - Enforces rate limiting on send: 5 requests per 15 minutes per IP (`checkRateLimit('otp:${ip}', 5, 900000)`).
   - Enforces email domain whitelist: `@gmail.com`, `@outlook.com`, `@outlook.in`.
   - Enforces resend cooldown of 60 seconds (`RESEND_COOLDOWN_MS = 60000`).
   - Enforces verification attempt throttling: deletes OTP and returns 429 after 5 failed attempts.

10. **`src/app/api/generate/content/route.ts` & `src/app/api/generate/analysis/route.ts`**:
    - Validates caller authentication via `verifySessionCookie(rawSession)`. Returns 401 Unauthorized JSON if unauthenticated.
    - Enforces rate limiting of 10 requests per minute per `gen:${sessionUuid || ip}`. Returns 429 if exceeded.
    - Enforces Zod body validation (`ContentSchema` and `AnalysisSchema`). Returns 400 with details if invalid.

11. **`src/app/actions/email-broadcast.ts` & `src/app/actions/feedback.ts`**:
    - Defines `escapeHtml` function sanitizing `&`, `<`, `>`, `"`, `'`.
    - Applied to email subject, body, and attachment names to prevent HTML/XSS injection.
    - Mass broadcasts use BCC to protect user email address privacy.

12. **`src/middleware.ts` (Lines 5-42)**:
    - Protects `/dashboard` routes: unauthenticated users without valid signed cookie are redirected to `/?login=true`.
    - Injects defensive HTTP security headers on all responses:
      - `X-Frame-Options: DENY`
      - `X-Content-Type-Options: nosniff`
      - `Referrer-Policy: strict-origin-when-cross-origin`
      - `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
      - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; ... frame-ancestors 'none';`

13. **`src/components/admin/admin-panel.tsx` (Lines 324-325, 347-386)**:
    - Admin table renders distinct "First Login" and "Last Login" columns.
    - Displays monospace IP badge (`u.firstLoginIp || u.lastKnownIp || "Unknown"`) and formatted timestamp with clock icon.

### Independent Verification Execution
1. **TypeScript Typecheck (`npm run typecheck` / `tsc --noEmit`)**:
   - Result: Exit code 0 (0 compilation errors).
2. **Production Build (`npm run build` / `next build`)**:
   - Result: `✓ Compiled successfully`.
   - Note: Windows OS-level file lock encountered on `.next/export` cleanup (`ENOTEMPTY`), but all compilation and type emission passed cleanly.
3. **Automated Test Suites (`node --test tests/test-*.mjs`)**:
   - Tests executed: 93 tests across 21 test suites (`test-1` through `test-21`).
   - Result: **93 passed, 0 failed, 0 skipped** (Exit code 0).
4. **Adversarial Test Script Note (`tests/adversarial-m1-stress.mjs`)**:
   - Created by Challenger 1.
   - When run in isolation via `npm test` (`tests/*.mjs`), failed with `ERR_MODULE_NOT_FOUND: Cannot find module '...node_modules\next\headers' imported from src/lib/ip.ts`.
   - Reason: Standalone Node.js ESM loader cannot resolve Next.js subpath export `next/headers` outside Next.js webpack/bundler environment.
   - The same test cases when executed via mocked headers contract (as in `tests/test-18` and `tests/test-21`) passed completely.

---

## 2. Logic Chain

1. **Integrity Mode Ground Truth**:
   - `ORIGINAL_REQUEST.md` specifies `Integrity mode: development`.
   - Development Mode prohibits: hardcoded test results, facade implementations, fabricated verification outputs.
   - All other engineering practices (libraries, frameworks, utilities) are permitted.

2. **Prohibited Pattern Verification**:
   - Hardcoded test outputs: Searched all modified files. Zero instances of embedded test results or dummy return values found.
   - Facade implementations: Evaluated all 15 deliverables. Every function contains genuine computational logic:
     - `createSignedSessionCookie` computes authentic HMAC-SHA256 hex digests.
     - `verifySessionCookie` computes expected digests and executes timing-safe comparison with `crypto.timingSafeEqual`.
     - `checkRateLimit` maintains real timestamp sliding windows and computes real remaining quotas.
     - `getClientIp` implements real proxy header extraction algorithms.
     - `User` schema persistently stores and updates IP fields across registration and login.
     - `getPublicProfileData` strictly projects out IP fields.
     - `searchAspirantsAction` strictly excludes `uuid`.
   - Fabricated artifacts: Searched repository for `.log` and pre-populated result files. Zero found.

3. **Empirical Behavioral Testing**:
   - `tsc --noEmit` executed independently: Exit code 0.
   - `node --test tests/test-*.mjs` executed independently: 93 of 93 tests passed (0 failures).

---

## 3. Caveats

1. **Standalone Node ESM Resolution with `src/lib/ip.ts`**:
   - `src/lib/ip.ts` imports `{ headers } from "next/headers"`. In Next.js runtime (server actions, API routes, middleware, and Next build), this works seamlessly.
   - When writing pure Node.js unit tests (`node --test`), importing `src/lib/ip.ts` directly triggers Node's ESM subpath limitation unless Node is instructed to resolve `.js` extensions or `headers()` is conditionally imported. Future test authors should pass a custom headers object or mock `headers()` when importing `ip.ts`.
2. **In-Memory Rate Limiting**:
   - `src/lib/rate-limiter.ts` uses an in-memory sliding window cache. If deployed across multiple server instances behind a load balancer without sticky sessions, a distributed store (e.g. Redis) should be introduced. For single-process deployments, the current implementation is optimal.

---

## 4. Conclusion

The Milestone 1 work product satisfies all integrity criteria under Development Mode. There are **zero facade implementations**, **zero hardcoded test strings**, and **zero fabricated outputs**. The security layers (HMAC-SHA256 session signing, timing-safe equality, sliding-window rate limiting, IP extraction with proxy precedence, IP schema storage, public profile IP exclusion, UUID redaction in Aspirants search, HTML sanitization, and security headers) are implemented authentically and verified empirically.

**Verdict: CLEAN**

---

## 5. Verification Method

To independently re-verify this verdict:
1. Run TypeScript typecheck:
   ```powershell
   npm run typecheck
   ```
   *Expected*: Exit code 0.
2. Run automated test suites:
   ```powershell
   node --test tests/test-*.mjs
   ```
   *Expected*: 93 tests passed, 0 failures.
3. Verify session HMAC signing in Node REPL:
   ```powershell
   node -e "const { createSignedSessionCookie, verifySessionCookie } = await import('./src/lib/session.ts'); const c = createSignedSessionCookie('12345678-1234-1234-1234-123456789abc'); console.log('Cookie:', c); console.log('Verified:', verifySessionCookie(c)); console.log('Tampered:', verifySessionCookie(c + 'a'));"
   ```
   *Expected*: Valid UUID returned for genuine cookie; `null` returned for tampered cookie.
