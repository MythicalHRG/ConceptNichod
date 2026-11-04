## 2026-11-04T02:10:13Z

Your identity: Worker M1 (Backend Core, Security & IP Tracking Worker)
Your working directory: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\worker_m1
Original request file: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\ORIGINAL_REQUEST.md
Scope document: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\suborch_m1\SCOPE.md
Project plan: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\orchestrator\PROJECT.md
Survey analysis & blueprint: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\explorer_survey_2\analysis.md
Survey handoff: c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\explorer_survey_2\handoff.md

MANDATORY FIRST STEP: Read c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\ORIGINAL_REQUEST.md completely.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write Ownership (Exclusive):
You may ONLY write/modify:
- `src/models/User.ts`
- `src/lib/ip.ts` (new)
- `src/lib/session.ts` (new)
- `src/lib/rate-limiter.ts` (new)
- `src/app/actions/auth.ts`
- `src/app/actions/admin.ts`
- `src/app/actions/aspirants.ts`
- `src/app/actions/profile.ts`
- `src/app/api/auth/otp/route.ts`
- `src/app/api/generate/analysis/route.ts`
- `src/app/api/generate/content/route.ts`
- `src/app/actions/email-broadcast.ts`
- `src/app/actions/feedback.ts`
- `src/middleware.ts`
- `src/components/admin/admin-panel.tsx`
DO NOT touch any files in `tests/` or frontend theme/class components (`globals.css`, `login-dialog.tsx`, etc.).

Implementation Tasks (Milestone 1):
1. **User Schema & IP Tracking (R4)**:
   - In `src/models/User.ts`: Add `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` to `IUser` and `UserSchema` (as optional strings and Dates). Keep `lastKnownIp` for backward compatibility.
   - In `src/lib/ip.ts`: Implement `getClientIp(): string` handling `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, and sanitization (normalize IPv6 localhost, strip non-IP characters).
   - In `src/app/actions/auth.ts`:
     - Update `registerAction`: capture `firstLoginIp: ip`, `firstLoginAt: now`, `lastLoginIp: ip`, `lastLoginAt: now`.
     - Update `loginAction`: update `lastLoginIp = ip`, `lastLoginAt = now`. If `!user.firstLoginIp`, backfill `firstLoginIp = ip` and `firstLoginAt = user.createdAt || now`.
   - In `src/app/actions/profile.ts`: In `getPublicProfileData`, update projection to explicitly exclude all IP fields: `-firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp`.
   - In `src/components/admin/admin-panel.tsx`: Update the user table in the Admin panel to display both "First Login" and "Last Login" IP address and formatted timestamp badges. Ensure non-admins cannot access this.

2. **Session Security & UUID Redaction (R1, R2)**:
   - In `src/app/actions/aspirants.ts:48-61`: In `searchAspirantsAction`, remove `uuid` from the returned public user object. Users must never see other users' UUIDs.
   - In `src/lib/session.ts`: Implement `createSignedSessionCookie(uuid: string): string` and `verifySessionCookie(cookieValue?: string): string | null` using HMAC-SHA256 with `process.env.ENCRYPTION_SECRET_KEY || "concept-nichod-default-secret-salt-2026"` in format `<uuid>.<signature>`. For backward compatibility, if an unsigned UUID matches regex, accept it or sign it.
   - In `src/app/actions/auth.ts` and `src/app/actions/admin.ts`: Use `createSignedSessionCookie` when setting `user_session` cookie, and `verifySessionCookie` when reading `user_session`.

3. **Rate Limiting & Defensive Hardening (R2)**:
   - In `src/lib/rate-limiter.ts`: Implement in-memory sliding-window rate limiter with LRU/timestamp cleanup: `checkRateLimit(key: string, limit: number, windowMs: number): { success: boolean, limit: number, remaining: number, resetMs: number }`.
   - Apply rate limiting to:
     - `loginAction`: 5 failed attempts per 15 minutes per IP/username.
     - `registerAction`: 3 registrations per hour per IP.
     - `POST /api/auth/otp`: 5 requests per 15 minutes per IP.
     - `POST /api/generate/analysis` and `POST /api/generate/content`: 10 requests per minute per IP/user.
   - In `src/app/api/auth/otp/route.ts`:
     - Check `Blacklist.findOne({ type: "ip", value: ip })` and `Blacklist.findOne({ type: "email", value: email })`. Return 403 if blacklisted.
     - Enforce `validateEmailDomain(email)` on OTP generation.
   - In `src/app/api/generate/analysis/route.ts` and `src/app/api/generate/content/route.ts`:
     - Validate request body with Zod schemas.
     - Return 401 JSON error on unauthenticated requests instead of throwing 500.
   - In `src/app/actions/email-broadcast.ts` and `src/app/actions/feedback.ts`:
     - Escape HTML entities in email body strings before template interpolation.
   - In `src/middleware.ts`:
     - Add security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).

Verification Requirements:
- Run `npm test` and verify all 33 existing tests continue to pass with 0 failures!
- Run `npm run typecheck` (`tsc --noEmit`) and verify 0 TypeScript compiler errors!
- Run `npm run build` (`next build`) and verify 0 production build errors!
- Document your changes, file diffs, and verification outputs in `c:\Users\Neha\Downloads\ConceptNichod\.agents\teamwork\worker_m1\handoff.md`.
- Send a message to orchestrator upon completion.


## 2026-11-04T02:16:43Z
**Context**: User Follow-Up Requirement — Anti-Bypass, Anti-Intrusion & Production Source Protection
**Content**: Sentinel has delivered a high-priority follow-up requirement:
"also add tasks to find loopholes and fix them by which users can come inside anything etc....etc....
lock points by which no one could see code or do anything, cant inspect, cant come in console or do anything etc"

For your Milestone 1 backend scope:
1. Ensure production source maps are disabled in `next.config.mjs` (`productionBrowserSourceMaps: false`) so original source code is never exposed in browser developer tools.
2. In `src/middleware.ts`, enforce strict defensive HTTP security headers:
   - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none';`
   - `X-Frame-Options: DENY` (prevents clickjacking)
   - `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. Ensure server-side authorization on all routes and server actions is airtight — no bypass via forged session or missing cookie checks.
**Action**: Incorporate these backend protection and header measures into your M1 implementation and verify with tests and build.
