# Implementation Plan: Milestone 1 — Backend Core, Security & IP Tracking

## Phase 1: Core Utilities & Schemas
- [ ] Step 1.1: Implement `src/lib/ip.ts` with `getClientIp()` and `sanitizeIp()`.
- [ ] Step 1.2: Implement `src/lib/session.ts` with `createSignedSessionCookie()` and `verifySessionCookie()` using HMAC-SHA256 with fallback to regex for backward compatibility.
- [ ] Step 1.3: Implement `src/lib/rate-limiter.ts` with `checkRateLimit()`, `recordFailedAttempt()`, `resetRateLimit()` sliding window with LRU cleanup.
- [ ] Step 1.4: Update `src/models/User.ts` to add `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` and pre-query hooks to handle signed session tokens in `uuid` lookups.

## Phase 2: Session Security, Redaction & IP Tracking in Actions
- [ ] Step 2.1: Update `src/app/actions/aspirants.ts` to redact `uuid` from `searchAspirantsAction` return payload and verify session cookie.
- [ ] Step 2.2: Update `src/app/actions/profile.ts` in `getPublicProfileData` to project out `-firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp`.
- [ ] Step 2.3: Update `src/app/actions/auth.ts`:
  - Use `getClientIp`
  - In `registerAction`: record `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`, `lastKnownIp`, set signed cookie, enforce rate limiting (3 registrations/hr/IP).
  - In `loginAction`: record `lastLoginIp`, `lastLoginAt`, backfill `firstLoginIp`/`firstLoginAt` if missing, set signed cookie, enforce rate limiting (5 failed attempts/15min).
  - In `meAction`, `updateProfileAction`, `requestEmailChangeOtpAction`, `confirmEmailChangeAction`, `changePasswordAction`, `deleteAccountAction`: use `verifySessionCookie`.
- [ ] Step 2.4: Update `src/app/actions/admin.ts`: use `verifySessionCookie`.
- [ ] Step 2.5: Update `src/app/actions/email-broadcast.ts` and `src/app/actions/feedback.ts`: use `verifySessionCookie` and escape HTML entities.

## Phase 3: API Route Hardening & Middleware
- [ ] Step 3.1: Update `src/app/api/auth/otp/route.ts`:
  - Enforce IP rate limiting (5 requests / 15 min / IP).
  - Check `Blacklist` for banned IP and banned email.
  - Enforce `validateEmailDomain(email)`.
- [ ] Step 3.2: Update `src/app/api/generate/analysis/route.ts` and `src/app/api/generate/content/route.ts`:
  - Rate limiting (10 req/min per IP/user).
  - Zod body validation.
  - 401 on unauthenticated calls.
- [ ] Step 3.3: Update `src/middleware.ts`:
  - Add security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).

## Phase 4: Admin Panel IP Display
- [ ] Step 4.1: Update `src/components/admin/admin-panel.tsx`:
  - Update user table to display both "First Login" and "Last Login" IP address and formatted timestamp badges.

## Phase 5: Verification & Quality Gate
- [ ] Step 5.1: Run `npm test` and verify 33/33 pass.
- [ ] Step 5.2: Run `npm run typecheck` and verify 0 errors.
- [ ] Step 5.3: Run `npm run build` and verify clean build.
- [ ] Step 5.4: Generate `handoff.md` and report to orchestrator.
