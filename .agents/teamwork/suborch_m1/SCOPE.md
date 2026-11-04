# Scope: Milestone 1 — Backend Core, Security & IP Tracking

## Architecture
- Backend: Next.js App Router API routes, Server Actions, Mongoose 9.9.3, Zod 3.23.8
- Security: Cryptographic HMAC session signing, sliding-window rate limiting, input sanitization, Blacklist checks, HTTP security headers
- IP Tracking: First/last login IP and timestamp capture in User schema, Admin panel display, Public profile isolation

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | IP & Login Timestamp Schema | Add `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` to User schema and IUser interface (`src/models/User.ts`) | M1 | PROJECT.md |
| 2 | Registration & Login IP Capture | Capture initial IP/timestamp on register; update last IP/timestamp on login (`src/app/actions/auth.ts`) | M1 | PROJECT.md |
| 3 | Hardened IP Resolver | Extract client IP handling `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` and sanitizing (`src/lib/ip.ts`) | M1 | PROJECT.md |
| 4 | Admin-Only IP Visibility | Display first/last login IPs and timestamps in Admin user management table (`src/components/admin/admin-panel.tsx`) | M1 | PROJECT.md |
| 5 | Public Profile IP Isolation | Strictly exclude all IP fields (`firstLoginIp`, `lastLoginIp`, `firstLoginAt`, `lastLoginAt`, `lastKnownIp`) from `getPublicProfileData` (`src/app/actions/profile.ts:12`) | M1 | PROJECT.md |
| 6 | Session Cookie HMAC Signing | Sign `user_session` cookie using HMAC-SHA256 with server secret (`<uuid>.<hmac>`) in `src/lib/session.ts` and verify in auth actions | M1 | PROJECT.md |
| 7 | UUID Redaction in Aspirants Search | Remove `uuid` from `searchAspirantsAction` return payload (`src/app/actions/aspirants.ts:49`) | M1 | PROJECT.md |
| 8 | Sliding-Window Rate Limiting | In-memory sliding-window rate limiter (`src/lib/rate-limiter.ts`) for login, register, OTP requests, and AI generation | M1 | PROJECT.md |
| 9 | OTP Hardening & Blacklist Defense | Check `Blacklist` for banned IP/email and enforce allowed email domains in `POST /api/auth/otp` (`src/app/api/auth/otp/route.ts`) | M1 | PROJECT.md |
| 10 | Email HTML Injection Sanitization | Escape HTML entities in outgoing email templates (`src/app/actions/email-broadcast.ts`, `src/app/actions/feedback.ts`) | M1 | PROJECT.md |
| 11 | API Route Body Validation | Add Zod validation and 401 on unauthenticated calls for `/api/generate/...` (`src/app/api/generate/analysis/route.ts`, `src/app/api/generate/content/route.ts`) | M1 | PROJECT.md |
| 12 | Defensive HTTP Security Headers | Add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) in `src/middleware.ts` | M1 | PROJECT.md |

## Code Layout (Exclusive Write Ownership)
- `src/models/User.ts`
- `src/lib/ip.ts`
- `src/lib/session.ts`
- `src/lib/rate-limiter.ts`
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
DO NOT touch any other files in this milestone.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1 Implementation & Gate | Features 1-12 implemented and verified via Explorer -> Worker -> Reviewer -> Challenger -> Auditor | none | IN_PROGRESS |
