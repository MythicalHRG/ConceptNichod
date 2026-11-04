# Project: ConceptNichod Comprehensive Audit & Upgrade

## Architecture
- **Framework**: Next.js 14.2.35 (App Router), React 18, TypeScript 5
- **Database**: MongoDB via Mongoose 9.9.3 (caching in `src/lib/mongoose.ts`, in-memory testing with `mongodb-memory-server`)
- **Authentication**: Custom session management via `user_session` cookie, `scrypt` password hashing, OTP verification via Nodemailer
- **Styling & UI**: Tailwind CSS, PostCSS, Radix UI primitives, Lucide icons, `next-themes`
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`) via `npm test` (`tests/*.mjs`)
- **Code Layout**:
  - `src/app/` — Next.js App Router pages, layouts, and API route handlers (`/api/...`)
  - `src/app/actions/` — Server Actions (`auth.ts`, `admin.ts`, `aspirants.ts`, `profile.ts`, `feedback.ts`, `broadcast.ts`, `email-broadcast.ts`, `followup.ts`)
  - `src/components/` — UI components (`auth/`, `dashboard/`, `concept-mirror/`, `admin/`, `ui/`)
  - `src/models/` — Mongoose schemas (`User.ts`, `Topic.ts`, `Blacklist.ts`, `OTP.ts`, etc.)
  - `src/lib/` — Backend utilities (`mongoose.ts`, `session.ts`, `ip.ts`, `rate-limiter.ts`, `utils.ts`)
  - `tests/` — Automated test suites executed via `node --test tests/*.mjs`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | IP & Login Timestamp Schema | Add `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` to User schema and IUser interface | M1 | Survey (E2) |
| 2 | Registration & Login IP Capture | Capture initial IP and timestamp on register; update last IP and timestamp on login | M1 | Survey (E2) |
| 3 | Hardened IP Resolver | Extract client IP accurately handling `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` and sanitizing | M1 | Survey (E2) |
| 4 | Admin-Only IP Visibility | Display first/last login IPs and timestamps in Admin user management table (`admin-panel.tsx`) | M1 | Survey (E1, E2) |
| 5 | Public Profile IP Isolation | Strictly exclude all IP fields (`firstLoginIp`, `lastLoginIp`, `firstLoginAt`, `lastLoginAt`, `lastKnownIp`) from `getPublicProfileData` | M1 | Survey (E1, E2) |
| 6 | Session Cookie HMAC Signing | Sign `user_session` cookie using HMAC-SHA256 with server secret (`<uuid>.<hmac>`) to prevent session forgery | M1 | Survey (E2) |
| 7 | UUID Redaction in Aspirants Search | Remove `uuid` from `searchAspirantsAction` public return payload to eliminate account takeover vector | M1 | Survey (E2) |
| 8 | Sliding-Window Rate Limiting | In-memory sliding-window rate limiter for login, register, OTP requests, and AI generation | M1 | Survey (E2) |
| 9 | OTP Hardening & Blacklist Defense | Check `Blacklist` for banned IP/email and enforce allowed email domains in `POST /api/auth/otp` | M1 | Survey (E2) |
| 10 | Email HTML Injection Sanitization | Escape HTML entities in outgoing email templates (`email-broadcast.ts`, `feedback.ts`) | M1 | Survey (E2) |
| 11 | API Route Body Validation | Add Zod schema validation and return 401 on unauthenticated calls for `/api/generate/...` | M1 | Survey (E2) |
| 12 | Class "12+" Registration Dropdown | Add "12+" to registration dialog class level select (`login-dialog.tsx`) | M2 | Survey (E1, E2) |
| 13 | Class "12+" Competitive Exam Activation | Include "12+" in conditional check (`login-dialog.tsx`) so 12+ students can select target exams | M2 | Survey (E1, E2) |
| 14 | Class "12+" Profile Edit Dropdown | Add "12+" to user profile edit modal (`user-profile-button.tsx`) | M2 | Survey (E1, E2) |
| 15 | Class "12+" Aspirants Connect Filter | Add "12+" to filter dropdown and ensure query logic matches 12+ in `aspirants.ts` | M2 | Survey (E1, E2) |
| 16 | Class "12+" Add Topic Dialog | Add "12+" to `indianClasses` list in `add-topic-button.tsx` | M2 | Survey (E1, E2) |
| 17 | Class "12+" Concept Mirror Integration | Pass student class level into Concept Mirror analysis and UI (`mastery-dashboard.tsx`) | M2 | Survey (E1, E2) |
| 18 | Six-Theme CSS System | Implement HSL color tokens for Light, Dark, Midnight Neon, Sunset Amber, Forest/Emerald, Cyberpunk/Indigo in `globals.css` | M3 | Survey (E1) |
| 19 | Theme Provider & Tailwind Config | Configure `<ThemeProvider>` `themes` prop and Tailwind `darkMode` selector for all 6 themes | M3 | Survey (E1) |
| 20 | Settings Appearance Tab | Add an "Appearance" tab in Settings dialog with interactive theme preview cards and swatches | M3 | Survey (E1) |
| 21 | Navbar Theme Switcher Upgrade | Upgrade theme dropdown in navbar with icons and swatches for all six themes | M3 | Survey (E1) |
| 22 | Persistent Theme Selection | Ensure selected theme persists in `localStorage` across page reloads and user sessions | M3 | Survey (E1) |
| 23 | Server Component onClick Bug Fix | Fix `src/app/dashboard/page.tsx:33` fatal bug passing inline `onClick` in async RSC | M3 | Survey (E1) |
| 24 | Floating Action Button Layout Polish | Fix collision between `AddTopicButton` and `BackgroundMusic` on mobile/tablet viewports | M3 | Survey (E1) |
| 25 | Defensive HTTP Security Headers | Add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) in middleware | M1 | Survey (E2) |
| 26 | Non-Interactive ESLint Config | Add `.eslintrc.json` so `npm run lint` executes cleanly without interactive prompt | M4 | Survey (E3) |
| 27 | Comprehensive Automated Test Suites | Create `test-15` through `test-20` in `tests/` covering R1-R6 | E2E | Survey (E3) |
| 28 | 100% Test Pass Rate & Clean Build | Verify all 33 existing tests + new test suites pass (0 failures), 0 TS errors, 0 build errors | M4 | Survey (E3) |
| 29 | Source Code Exposure Protection | Disable production browser source maps in `next.config.mjs` (`productionBrowserSourceMaps: false`) to prevent client code exposure | M1 | User Follow-up |
| 30 | Client DevTools & Anti-Inspection | Add client-side deterrence (block contextmenu, F12/Ctrl+Shift+I/Ctrl+U shortcuts, console protection) | M3 | User Follow-up |
| 31 | Anti-Bypass Security Headers & CSP | Strict CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and airtight server route guards in `middleware.ts` | M1 | User Follow-up |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Design and implement automated test suites `test-15` through `test-20` covering R1-R6, generate `TEST_READY.md` | none | DONE |
| M1 | Backend Core, Security & IP Tracking | Features 1-11, 25, 29, 31: User schema IP fields, IP capture, Admin view, Profile isolation, Session HMAC, UUID redaction, Rate limiting, OTP hardening, Input validation, Source map suppression, Strict CSP & security headers | none | IN_PROGRESS |
| M2 | Academic Class Level "12+" | Features 12-17: Class "12+" in registration, competitive exams, profile edit, Aspirants Connect filter, Add Topic dialog, Concept Mirror integration | none | PLANNED |
| M3 | UI/UX Polish & Six-Theme System | Features 18-24, 30: globals.css 6 themes, ThemeProvider, Tailwind config, Appearance tab in Settings, Navbar dropdown, Server Component onClick fix, FAB collision fix, Client DevTools/anti-inspection deterrence | none | PLANNED |
| M4 | Final Milestone & Hardening | Feature 26, 28: Phase 1 pass 100% E2E tests (existing 33 + new suites), zero TS errors, clean build; Phase 2 adversarial coverage hardening | E2E, M1, M2, M3 | PLANNED |

## Interface Contracts
### IP Resolver Contract (`src/lib/ip.ts`)
```typescript
export function getClientIp(): string;
export function sanitizeIp(ip: string): string;
```

### Session Contract (`src/lib/session.ts`)
```typescript
export function createSignedSessionCookie(uuid: string): string;
export function verifySessionCookie(cookieValue?: string): string | null; // returns uuid or null
```

### Rate Limiter Contract (`src/lib/rate-limiter.ts`)
```typescript
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult;
```

### User Schema Extensions (`src/models/User.ts`)
```typescript
export interface IUser extends Document {
  // Existing fields...
  firstLoginIp?: string;
  firstLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginAt?: Date;
  lastKnownIp?: string;
}
```

### Theme Names (`src/lib/themes.ts` or constants)
```typescript
export const THEMES = [
  'light',
  'dark',
  'midnight-neon',
  'sunset-amber',
  'forest-emerald',
  'cyberpunk-indigo'
] as const;
export type ThemeId = typeof THEMES[number];
```
