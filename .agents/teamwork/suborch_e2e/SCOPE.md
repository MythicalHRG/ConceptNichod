# Scope: E2E Testing Track

## Test Architecture
- Framework: Native Node.js test runner (`node:test`, `node:assert/strict`) via `node --test tests/*.mjs`
- Test files location: `c:\Users\Neha\Downloads\ConceptNichod\tests\`
- In-memory database: `mongodb-memory-server` (^11.2.0)
- Deliverable: Publish `TEST_READY.md` at project root (`c:\Users\Neha\Downloads\ConceptNichod\TEST_READY.md`)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Rate Limiting Test Suite | `tests/test-15-security-rate-limiting.mjs` verifying sliding-window rate limiting on auth, OTP, AI routes | E2E | TEST_INFRA |
| 2 | Session & Role Security Test Suite | `tests/test-16-session-security-and-role-isolation.mjs` verifying HMAC session signing, tampering rejection, UUID redaction, admin isolation | E2E | TEST_INFRA |
| 3 | Theming System Test Suite | `tests/test-17-theming-system-six-themes.mjs` verifying 6 themes, CSS variables, persistence | E2E | TEST_INFRA |
| 4 | IP & Timestamp Tracking Test Suite | `tests/test-18-ip-and-login-timestamp-tracking.mjs` verifying User schema fields, register/login capture, admin visibility, profile exclusion | E2E | TEST_INFRA |
| 5 | Class 12+ Validation Test Suite | `tests/test-19-class-12-plus-validation-and-filter.mjs` verifying "12+" validation, dropdowns, filters, competitive exam options | E2E | TEST_INFRA |
| 6 | Audit & Regression Test Suite | `tests/test-20-audit-and-edge-case-regression.mjs` verifying RSC onClick fix, FAB overlap fix, email HTML escaping, OTP domain/blacklist defense | E2E | TEST_INFRA |

## Code Layout
- Write ownership: ONLY `tests/test-15-*.mjs` through `tests/test-20-*.mjs` and `TEST_READY.md`. Do NOT touch files in `src/`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Create Test Suites 15-20 | Implement test suites covering all requirements | none | IN_PROGRESS |
| 2 | Publish TEST_READY.md | Signal readiness with full test manifest and coverage summary | M1 | PLANNED |
