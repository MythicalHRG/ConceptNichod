# E2E Test Infra: ConceptNichod

## Test Philosophy
- Opaque-box, requirement-driven. Derived from user requirements in `ORIGINAL_REQUEST.md`.
- Native test runner: `node:test` + `node:assert/strict` via `npm test` (`tests/*.mjs`).
- Fast, zero external runner dependencies, zero Babel/bundler conflicts.
- In-memory database integration: `mongodb-memory-server` (^11.2.0) for schema and database testing.

## Existing Baseline
- 14 test suites (`tests/test-1-*.mjs` to `tests/test-14-*.mjs`)
- 33 tests passing with 0 failures (~950ms execution time)
- Clean TypeScript compilation (`npm run typecheck`, 0 errors)
- Clean Next.js production build (`npm run build`, 0 errors)

## New Test Suites (Tiers 1-4)
1. `tests/test-15-security-rate-limiting.mjs`
   - Test sliding-window rate limiting on sensitive auth endpoints, OTP, and AI generation.
   - Test rate limit reset and threshold enforcement.
2. `tests/test-16-session-security-and-role-isolation.mjs`
   - Test HMAC-SHA256 session token generation and verification.
   - Test rejection of forged/tampered session tokens.
   - Test redaction of `uuid` from `searchAspirantsAction`.
   - Test admin role isolation (`verifyAdmin()`, admin routes, Bade Maalik badge preserved).
3. `tests/test-17-theming-system-six-themes.mjs`
   - Test definition of all six themes: Light, Dark, Midnight Neon, Sunset Amber, Forest/Emerald, Cyberpunk/Indigo.
   - Test CSS variable definitions in `globals.css` for each theme.
   - Test `<ThemeProvider>` supported themes and persistence mechanism.
4. `tests/test-18-ip-and-login-timestamp-tracking.mjs`
   - Test User schema fields: `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`.
   - Test IP capture on user registration and authentication.
   - Test public profile projection strictly excludes all IP fields.
   - Test Admin panel view securely displays IP tracking fields.
5. `tests/test-19-class-12-plus-validation-and-filter.mjs`
   - Test "12+" accepted as valid class level in validation schemas.
   - Test "12+" in registration dropdown, user profile edit dropdown, and Add Topic dialog.
   - Test "12+" enables competitive exam options (JEE, NEET, UPSC).
   - Test filtering by "12+" in Aspirants Connect returns matching users.
   - Test Concept Mirror integration with student class level.
6. `tests/test-20-audit-and-edge-case-regression.mjs`
   - Test full-stack audit bug fixes: Server Component onClick bug elimination in dashboard, FAB overlap fix, HTML entity escaping in emails, OTP blacklist and email domain enforcement, non-interactive ESLint execution.

## Coverage Goals
- 100% automated test pass rate across existing 33 tests + all new test suites.
- 0 TypeScript compiler errors (`npm run typecheck`).
- 0 Next.js production build errors (`npm run build`).
