# Comprehensive Backend, Auth, Security & Data Survey Report

**Project**: ConceptNichod  
**Target Repository**: https://github.com/MythicalHRG/ConceptNichod.git  
**Investigator**: Explorer 2 (Backend, Auth, Security & Data Explorer)  
**Date**: 2026-11-04  
**Scope**: Read-only exploration of backend APIs, authentication, MongoDB models, security layers, data validation, rate limiting, and academic class level "12+".

---

## Executive Summary

ConceptNichod is built with **Next.js 14.2.35 (App Router)**, **Mongoose 9.9.3**, **Zod 3.23.8**, **Nodemailer**, and **OpenRouter AI**. Authentication is implemented using a custom session cookie mechanism (`user_session`), and database interactions are performed via Mongoose models and Next.js Server Actions.

While core flows (registration, OTP verification, password hashing with `scrypt`, admin management, and AI topic flows) function, the backend audit has uncovered **10 significant security vulnerabilities, structural gaps, and edge cases**, including **1 CRITICAL vulnerability that allows immediate account takeover and admin impersonation**, sensitive IP address exposure risks, missing rate limiting on brute-force vectors and expensive AI APIs, missing "12+" academic class levels across validation and filtering, and unverified raw cookies in middleware.

---

## 1. Backend Architecture & Route Topology

### 1.1 API Routes (`src/app/api/...`)
| Route | Method | Purpose | Auth Mechanism | Current Issues / Risks |
|---|---|---|---|---|
| `/api/auth/otp` | `POST` | Dispatches 6-digit email OTPs & verifies codes | None (Public) | Missing IP rate limiting; missing Blacklist check; missing allowed email domain enforcement on send; attacker can abuse as an open email relay or spam targets. |
| `/api/cron/cleanup` | `GET` | Deletes expired broadcasts & UploadThing files | Bearer token (`CRON_SECRET`) | Correctly fails closed if `CRON_SECRET` is unset or invalid. |
| `/api/generate/analysis` | `POST` | Calls `runFinalAnalysisAction` for topic answers | Delegates to Server Action cookie check | Lacks route-level Zod validation; unauthenticated requests throw 500 error instead of returning 401; no rate limiting on costly AI processing. |
| `/api/generate/content` | `POST` | Calls `generateContentAction` for summary & questions | Delegates to Server Action cookie check | Lacks route-level Zod validation; unauthenticated requests throw 500 error instead of 401; no rate limiting. |
| `/api/uploadthing` | `POST`/`GET` | UploadThing SDK file handling | UploadThing router (`ourFileRouter`) | Correctly checks admin session cookie in `broadcastAttachment` middleware (`src/app/api/uploadthing/core.ts:14-20`). |

### 1.2 Server Actions (`src/app/actions/...`)
- **`src/app/actions/auth.ts`**:
  - `registerAction(formData)`: Validates email domain, username regex, password strength, IP/email/username blacklist, and OTP verification record. Issues `user_session` cookie containing raw `uuid`.
  - `loginAction(formData)`: Verifies credentials using `scrypt` (`comparePassword`), updates `lastKnownIp`, issues `user_session` cookie containing raw `user.uuid`.
  - `logoutAction()`: Deletes `user_session` cookie.
  - `meAction()`: Reads `user_session` cookie, queries `User.findOne({ uuid })`, returns user object.
  - `updateProfileAction(formData)`: Updates bio, classLevel, examFocus, city, futureCollege, socials.
  - `requestEmailChangeOtpAction(newEmail)` & `confirmEmailChangeAction(newEmail, otp)`: Multi-step email modification with OTP verification.
  - `resetPasswordAction(formData)`: Resets password if OTP is verified.
  - `changePasswordAction(formData)`: Re-authenticates old password and hashes new password.
  - `deleteAccountAction(formData)`: Deletes user, their topics, and clears session (protects admin `mythicalhrg` from deletion).
- **`src/app/actions/admin.ts`**:
  - `verifyAdmin()`: Queries user by `user_session` UUID, asserts `user.username === "mythicalhrg"`, sets `user.role = "admin"`.
  - `getAllUsersAction()`: Excludes password hash, returns all registered users.
  - `deleteUserAction(uuid)`: Deletes user and associated topics.
  - `banEntityAction(type, value, reason)` & `unbanEntityAction(id)`: Manages `Blacklist` entries for `ip`, `email`, or `username`.
  - `getBansAction()`: Retrieves active bans.
- **`src/app/actions/aspirants.ts`**:
  - `searchAspirantsAction(filters)`: Queries users filtering by `searchQuery`, `classLevel`, `gender`, `city`. **CRITICAL BUG**: Returns `uuid: u.uuid` of other users.
- **`src/app/actions/profile.ts`**:
  - `getPublicProfileData(username)`: Queries user data, computes score aggregates, subject distributions, skill metrics, and learning progressions. **DATA LEAK RISK**: Omits IP fields from exclusion projection.
- **`src/app/actions/broadcast.ts`**:
  - Admin in-app broadcast creation, retrieval of active non-expired broadcasts, read notification tracking.
- **`src/app/actions/email-broadcast.ts`**:
  - Official email broadcast via Gmail SMTP with BCC privacy protection.
- **`src/app/actions/followup.ts`**:
  - `askFollowUpAction(input)`: Authenticated AI follow-up queries with sliding history window of 10 messages.
- **`src/app/actions.ts`**:
  - `generateContentAction`, `runFinalAnalysisAction`, `createTopicAction`, `markSummaryViewedAction`, `updateTopicProgressAction`.

### 1.3 Middleware (`src/middleware.ts`)
- Current implementation (`src/middleware.ts:4-24`):
  ```typescript
  export function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('user_session')
    if (!sessionCookie && request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('login', 'true')
      return NextResponse.redirect(url)
    }
    if (sessionCookie && request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }
  export const config = { matcher: ['/dashboard/:path*'] }
  ```
- **Flaws Identified**:
  1. The cookie check only tests for string presence (`!sessionCookie`). Any forged cookie (`user_session=abc`) bypasses middleware for all `/dashboard` routes.
  2. The matcher only covers `/dashboard/:path*`, so the `/auth` redirect block (`lines 15-17`) is never executed.
  3. No rate limiting or IP-level blacklist checks occur in middleware.
  4. Standard defensive HTTP security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`) are completely absent.

### 1.4 Database Connection Logic (`src/lib/mongoose.ts`)
- Utilizes global connection caching (`global.mongoose = { conn: null, promise: null }`).
- Sets `bufferCommands: false`, `serverSelectionTimeoutMS: 2500` (fast cold start handling), `socketTimeoutMS: 45000`, and `connectTimeoutMS: 10000`.
- Connection rejection properly clears `cached.promise = null` (`src/lib/mongoose.ts:38`).
- Database wake-up retry state is handled smoothly in `src/app/dashboard/layout.tsx:47-64` and `src/app/dashboard/page.tsx:26-38`.

---

## 2. MongoDB Models & Login IP/Timestamp Tracking Audit

### 2.1 Current `User` Schema (`src/models/User.ts`)
```typescript
export interface IUser extends Document {
  uuid: string;
  username: string;
  email: string;
  password: string; // scrypt hash
  fullName: string;
  gender: string;
  dob: string;
  classLevel: string;
  examFocus?: string;
  city: string;
  futureCollege?: string;
  snapchat?: string;
  instagram?: string;
  bio?: string;
  role: "user" | "admin";
  lastKnownIp?: string;  // <-- Only field currently present!
  createdAt: Date;
}
```

### 2.2 Required Schema Enhancements for IP & Timestamp Tracking
To fulfill Requirement R4 and Task 2, four new fields must be added to `IUser` and `UserSchema`:
```typescript
firstLoginIp?: string;
firstLoginAt?: Date;
lastLoginIp?: string;
lastLoginAt?: Date;
```
Mongoose definition:
```typescript
firstLoginIp: { type: String, required: false },
firstLoginAt: { type: Date, required: false },
lastLoginIp: { type: String, required: false },
lastLoginAt: { type: Date, required: false },
```

### 2.3 Capturing IP and Timestamps on Registration & Login
1. **Registration (`registerAction` in `src/app/actions/auth.ts:107-122`)**:
   - Currently sets only `lastKnownIp: ip`.
   - Update to:
     ```typescript
     const now = new Date();
     const newUser = await User.create({
         uuid,
         username,
         email,
         password: encryptedPassword,
         fullName,
         gender,
         dob,
         classLevel,
         examFocus: examFocus || undefined,
         city,
         futureCollege: futureCollege || undefined,
         snapchat: snapchat || undefined,
         instagram: instagram || undefined,
         role: "user",
         firstLoginIp: ip,
         firstLoginAt: now,
         lastLoginIp: ip,
         lastLoginAt: now,
         lastKnownIp: ip
     });
     ```
2. **Login (`loginAction` in `src/app/actions/auth.ts:177-179`)**:
   - Currently sets only `user.lastKnownIp = ip`.
   - Update to:
     ```typescript
     const now = new Date();
     user.lastLoginIp = ip;
     user.lastLoginAt = now;
     user.lastKnownIp = ip;
     if (!user.firstLoginIp) {
         user.firstLoginIp = ip;
         user.firstLoginAt = user.createdAt || now;
     }
     await user.save();
     ```

### 2.4 Robust IP Address Retrieval Across Proxies & Headers
Currently, `getIpAddress()` in `src/app/actions/auth.ts:17-23` is:
```typescript
function getIpAddress() {
    const forwardedFor = headers().get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return headers().get("x-real-ip") || "127.0.0.1";
}
```
**Recommended Hardened IP Resolver (`src/lib/ip.ts`)**:
```typescript
import { headers } from "next/headers";

export function getClientIp(): string {
  const h = headers();
  // Cloudflare priority
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Standard reverse proxy header (leftmost client IP)
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return sanitizeIp(first);
  }

  const realIp = h.get("x-real-ip");
  if (realIp) return sanitizeIp(realIp.trim());

  return "127.0.0.1";
}

function sanitizeIp(ip: string): string {
  // Normalize IPv6 localhost/IPv4-mapped IPv6
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.substring(7);
  // Strip unexpected characters
  return ip.replace(/[^a-fA-F0-9:.]/g, "").slice(0, 45);
}
```

### 2.5 Strict Restriction of IP and Timestamp Data to Admin Views Only
- **Admin View Access (`src/app/actions/admin.ts:29-34`)**:
  - In `getAllUsersAction()`: Protected by `verifyAdmin()`. Admin can safely inspect `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`, and `lastKnownIp`.
  - In `src/components/admin/admin-panel.tsx:320-365`: Update table headers and cells to show both "First Login" and "Last Login" IP and timestamps.
- **Non-Admin View Data Protection**:
  1. **`getPublicProfileData` (`src/app/actions/profile.ts:12`)**:
     - Current: `.select("-password -email -uuid -_id -createdAt -__v")`
     - **CRITICAL**: Must update projection to explicitly exclude all IP fields:
       `.select("-password -email -uuid -_id -createdAt -__v -firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp")`
  2. **`meAction` (`src/app/actions/auth.ts:215-220`)**:
     - Explicitly constructs the user object without including `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`, or `lastKnownIp`.
  3. **`searchAspirantsAction` (`src/app/actions/aspirants.ts:48-61`)**:
     - Maps only public fields (`fullName`, `username`, `gender`, `classLevel`, `examFocus`, `city`, `futureCollege`, `snapchat`, `instagram`, `bio`). Must NEVER return IP or timestamp fields.

---

## 3. Academic Class Level "12+" Survey & Impact Matrix

Requirement R5 states: *Add "12+" as an academic class level across the application, including drop-down selection, schema validation, and filtering across Aspirants Connect, Concept Mirror, and user profile.*

### 3.1 All Code Locations Requiring Updates for "12+"
| File Path | Line(s) | Current Code | Required Modification |
|---|---|---|---|
| `src/components/auth/login-dialog.tsx` | 453 | `["Class 1", ..., "Class 12", "Dropper"]` | Add `"12+"` to the registration class dropdown list. |
| `src/components/auth/login-dialog.tsx` | 461 | `['Class 11', 'Class 12', 'Dropper'].includes(classLevel)` | Update condition to: `['Class 11', 'Class 12', '12+', 'Dropper'].includes(classLevel)` so 12+ students can select competitive exam targets (IIT JEE, NEET, UPSC). |
| `src/components/auth/user-profile-button.tsx` | 351 | `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper", "Other"]` | Add `"12+"` to the edit profile class dropdown. |
| `src/app/dashboard/aspirants-connect/page.tsx` | 86 | `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper"]` | Add `"12+"` to the search filter class dropdown. |
| `src/components/dashboard/add-topic-button.tsx` | 33-37 | `const indianClasses = ["Class 1", ..., "Class 12"];` | Add `"12+"` to `indianClasses`. |
| `src/components/concept-mirror/mastery-dashboard.tsx` | 316 | `classLevel="Class 11-12"` | Replace hardcoded string with the student's actual class level (including `"12+"`), or provide class selector. |
| `src/components/concept-mirror/mastery-dashboard.tsx` | 283 | `analyzeConceptExplanation({ conceptName, userTranscript })` | Pass student `classLevel` into `analyzeConceptExplanation`. |
| `src/app/actions/aspirants.ts` | 34-36 | `if (typeof filters.classLevel === 'string' && filters.classLevel !== "All") query.classLevel = filters.classLevel.trim();` | Ensure exact and normalized matching for `"12+"` and `"Class 12+"`. |
| `src/app/actions/auth.ts` | 55, 230 | `formData.get("classLevel")` | Add validation schema asserting allowed classes including `"12+"`. |

### 3.2 AI Flow Compatibility
All AI prompt generators (`generate-topic-summary.ts`, `generate-questions.ts`, `analyze-answers.ts`, `analyze-concept-explanation.ts`) receive `classLevel: string` as an input parameter.
- When `classLevel` is `"12+"`, AI flows naturally interpret the learner as a post-secondary / college / entrance exam aspirant (e.g. JEE dropper, NEET repeater, college student).
- To make prompts even sharper, prompt templates can explicitly note: `${classLevel === '12+' ? 'post-grade 12 advanced/competitive' : classLevel}`.

---

## 4. Comprehensive Security Hardening Audit

### 4.1 Rate Limiting Architecture
- **Current State**:
  - Only `src/app/api/auth/otp/route.ts` implements a 60s per-email cooldown and 5-attempt limit on verification.
  - **Zero rate limiting exists** on `loginAction`, `registerAction`, `resetPasswordAction`, `/api/generate/content`, `/api/generate/analysis`, and `askFollowUpAction`.
- **Vulnerabilities**:
  - **Credential Stuffing & Brute Force**: An attacker can send thousands of login guesses without lockout.
  - **Email Bombing**: An attacker can cycle through thousands of distinct email addresses on `POST /api/auth/otp` from a single IP, as the cooldown is keyed solely by email, not by IP.
  - **AI Resource Exhaustion & Financial Denial of Service**: Costly OpenRouter API calls (`/api/generate/...` and `askFollowUpAction`) can be called repeatedly in an automated loop.
- **Architectural Proposal**:
  Implement a lightweight, high-performance in-memory sliding window rate limiter (`src/lib/rate-limiter.ts`) with LRU timestamp tracking and automatic stale key eviction:
  ```typescript
  // Recommended rate limits:
  // - OTP requests: 5 per 15 minutes per IP
  // - Login attempts: 5 failed attempts per 15 minutes per IP/identifier
  // - Registration: 3 accounts per hour per IP
  // - AI generation: 10 calls per minute per user/IP
  // - Follow-up chat: 20 messages per minute per user
  ```

### 4.2 Session Security Audit
- **Critical Vulnerability Identified (Account Takeover via Predictable / Exposed Session ID)**:
  - In `src/app/actions/auth.ts:127, 184`: Session cookie is set as:
    `cookies().set("user_session", user.uuid, { httpOnly: true, secure: ..., sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 })`
  - In `src/app/actions/aspirants.ts:49`:
    `return users.map((u: any) => ({ uuid: u.uuid, username: u.username, ... }))`
  - **Reproduction**:
    1. Attacker signs into ConceptNichod as a regular user.
    2. Attacker navigates to Aspirants Connect (`/dashboard/aspirants-connect`) and searches for `mythicalhrg` (or any user).
    3. The API response returns `mythicalhrg`'s `uuid`.
    4. Attacker opens browser developer tools or sends request with cookie `user_session=<mythicalhrg's uuid>`.
    5. Attacker visits `/dashboard/admin` or calls `getAllUsersAction()` or `deleteUserAction()`.
    6. Attacker is recognized as root admin `mythicalhrg`!
- **Remediation**:
  1. **Immediately remove `uuid`** from `searchAspirantsAction` return object. Non-admin users should only ever see `username`.
  2. **Cryptographically sign session cookies**: Session cookie should be HMAC-SHA256 signed using `ENCRYPTION_SECRET_KEY`:
     `sessionToken = `${uuid}.${generateHmac(uuid, SECRET)}``
  3. When validating `user_session` across server actions, verify the HMAC signature before database lookup. Any tampered or unsigned cookie is instantly rejected.
  4. Ensure `SameSite: "Lax"`, `HttpOnly: true`, and `Secure: true` in production.

### 4.3 Input Validation & Sanitization Audit
1. **API Route Body Validation**:
   - `src/app/api/generate/analysis/route.ts` and `src/app/api/generate/content/route.ts` must use Zod schemas (`analysisRouteSchema`, `contentRouteSchema`) to validate request bodies rather than loose object destructuring.
2. **Server Action Form Sanitization**:
   - In `updateProfileAction`: Sanitize inputs with Zod (`z.object({ username: z.string().optional(), bio: z.string().max(300).optional(), classLevel: z.string().optional(), ... })`).
   - Reject arbitrary object properties to prevent NoSQL operator injection.
3. **HTML Email Injection Prevention**:
   - In `sendEmailBroadcastAction` (`src/app/actions/email-broadcast.ts:96-98`): `${body}` is interpolated directly into HTML. Must escape HTML entities (`&`, `<`, `>`, `"`, `'`) before template embedding, or format safe Markdown.
   - In `submitFeedbackAction` (`src/app/actions/feedback.ts:35`): `${message}` is interpolated directly into HTML without escaping. Must escape HTML entities.

### 4.4 Role Isolation & RBAC Audit
- **Current State**:
  - Admin access is tightly restricted to `username === "mythicalhrg"` in `admin.ts`, `changelog.ts`, `broadcast.ts`, `email-broadcast.ts`, `uploadthing/core.ts`, and `dashboard/admin/page.tsx`.
  - Roles in database: `User.role` has enum `["user", "admin"]`.
  - Special decorative titles: `@anurag` and `@rohit` receive the `"👑 Bade Maalik"` badge in UI table (`admin-panel.tsx:331`), but have standard regular user permissions (verified by `tests/test-7-bade-maalik-and-role-titles.mjs`).
- **Defects & Hardening**:
  - `User.role` in MongoDB should be kept strictly in sync with admin privileges.
  - No client payload must ever be able to set or update `role`. Neither `registerAction` nor `updateProfileAction` accept `role` from user input, which is good.
  - `deleteUserAction` prevents deleting `mythicalhrg` (`admin.ts:41`).
  - `banEntityAction` prevents banning `mythicalhrg` (`admin.ts:54`).
  - With cryptographic session signing and `uuid` exclusion from public actions, admin privilege escalation vectors are completely closed.

---

## 5. Catalog of Existing Bugs, Glitches, Vulnerabilities & Edge Cases

| ID | Severity | Category | File & Line | Description | Remediation |
|---|---|---|---|---|---|
| **BUG-01** | **CRITICAL** | Security / Auth | `src/app/actions/aspirants.ts:49` & `src/app/actions/auth.ts:127, 184` | **Account Takeover via Exposed Session ID**: `user_session` cookie is the raw `uuid`. `searchAspirantsAction` returns `uuid` of other users in JSON. Anyone can copy another user's/admin's `uuid`, set the cookie, and take over the account. | Remove `uuid` from `searchAspirantsAction` return object. Sign `user_session` cookie with HMAC-SHA256 (`<uuid>.<hmac>`) using server secret. |
| **BUG-02** | **HIGH** | Privacy / Security | `src/app/actions/profile.ts:12` | **IP Address Leak on Public Profile**: `getPublicProfileData` uses `.select("-password -email -uuid -_id -createdAt -__v")`. Once `firstLoginIp`, `lastLoginIp`, etc. are stored, they are NOT excluded and will be leaked to unauthenticated profile visitors. | Update `.select(...)` to explicitly exclude `-firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp`. |
| **BUG-03** | **HIGH** | Security / DoS | `src/app/actions/auth.ts:142`, `src/app/api/auth/otp/route.ts:10` | **Missing Rate Limiting on Login & OTP**: No rate limiting exists on login attempts (brute-force vulnerability) or OTP generation per IP (email spam relay). | Implement sliding window rate limiter in `src/lib/rate-limiter.ts` protecting login, registration, and OTP endpoints. |
| **BUG-04** | **HIGH** | Security / Abuse | `src/app/api/auth/otp/route.ts:24-34` | **Banned IPs & Emails Can Still Trigger OTPs**: `POST /api/auth/otp` does not query `Blacklist`. Banned IPs and banned emails can continue to trigger transactional emails. | Add `Blacklist.findOne({ type: "ip", value: ip })` and `Blacklist.findOne({ type: "email", value: email })` check in `POST /api/auth/otp`. |
| **BUG-05** | **MEDIUM** | Security / Abuse | `src/app/api/auth/otp/route.ts:27-46` | **Unrestricted Email Domains on OTP Send**: Registration requires `@gmail.com`, `@outlook.com`, `@outlook.in`, but `POST /api/auth/otp` allows sending OTP to any domain if `!isPasswordReset`. | Enforce `validateEmailDomain(email)` in `POST /api/auth/otp`. |
| **BUG-06** | **MEDIUM** | Feature Gap / Data | `src/models/User.ts:19, 39` & `src/app/actions/auth.ts:121, 178` | **Missing First/Last Login IP & Timestamps**: Schema only has `lastKnownIp`. No `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`. Admin panel only shows `lastKnownIp`. | Add four fields to `IUser` & `UserSchema`. Capture in `registerAction` and `loginAction`. Display in Admin Panel users table. |
| **BUG-07** | **MEDIUM** | Feature Gap / UI | `login-dialog.tsx:453, 461`, `user-profile-button.tsx:351`, `aspirants-connect/page.tsx:86`, `add-topic-button.tsx:36` | **Academic Class Level "12+" Missing**: "12+" is not an option in registration, profile edit, Aspirants Connect filter, or Add Topic dialog. Competitive exams don't show for 12+. | Add `"12+"` across all class dropdowns and conditional exam focus triggers. |
| **BUG-08** | **MEDIUM** | Security / Stability | `src/app/api/generate/analysis/route.ts:9`, `src/app/api/generate/content/route.ts:9` | **Missing Zod Validation & 500 on Unauthenticated API**: Request bodies are not validated with Zod. Unauthenticated callers receive 500 internal error instead of clean 401. | Add Zod validation and return 401 JSON response if unauthenticated. |
| **BUG-09** | **MEDIUM** | Security / Injection | `email-broadcast.ts:96-98`, `feedback.ts:35` | **HTML Injection in Outgoing Emails**: Raw strings from user feedback and admin broadcasts are interpolated directly into HTML email templates. | Escape HTML entities using `escapeHtml()` helper before interpolating into email templates. |
| **BUG-10** | **LOW** | Security / Configuration | `src/middleware.ts:4-24` | **Shallow Cookie Check & Missing Security Headers**: Middleware checks only string existence of cookie without signature verification. No HTTP security headers are set. | Verify cookie signature in middleware; inject HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy`). |

---

## 6. Implementation Blueprint for Upgrades

### Blueprint A: User Model & Login Tracking Upgrade
1. In `src/models/User.ts`:
   - Add `firstLoginIp?: string; firstLoginAt?: Date; lastLoginIp?: string; lastLoginAt?: Date;`
2. In `src/app/actions/auth.ts`:
   - Update `registerAction` to set `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt`.
   - Update `loginAction` to update `lastLoginIp`, `lastLoginAt`, and backfill `firstLoginIp`/`firstLoginAt` if missing.
3. In `src/components/admin/admin-panel.tsx`:
   - Update the table in the "Manage Users" tab to show `First Login` (IP & Date) and `Last Login` (IP & Date).
4. In `src/app/actions/profile.ts`:
   - Update `.select(...)` in `getPublicProfileData` to explicitly exclude all IP fields.

### Blueprint B: Academic Class Level "12+"
1. In `src/components/auth/login-dialog.tsx`:
   - Include `"12+"` in the class level options.
   - Update `['Class 11', 'Class 12', '12+', 'Dropper'].includes(classLevel)` to show competitive exams for 12+ students.
2. In `src/components/auth/user-profile-button.tsx`:
   - Include `"12+"` in the class level options.
3. In `src/app/dashboard/aspirants-connect/page.tsx`:
   - Include `"12+"` in class level filter.
4. In `src/components/dashboard/add-topic-button.tsx`:
   - Include `"12+"` in `indianClasses`.
5. In `src/components/concept-mirror/mastery-dashboard.tsx`:
   - Connect user's actual class level into concept analysis.

### Blueprint C: Security Hardening & Session Protection
1. In `src/lib/session.ts` (new):
   - Provide `createSignedSessionCookie(uuid: string): string` and `verifySessionCookie(cookieValue: string): string | null` using HMAC-SHA256 with `ENCRYPTION_SECRET_KEY`.
2. In `src/app/actions/auth.ts`:
   - Use `createSignedSessionCookie` on login/register.
   - Use `verifySessionCookie` in `meAction`, `updateProfileAction`, etc.
3. In `src/app/actions/aspirants.ts`:
   - Remove `uuid` from the returned public user objects.
4. In `src/lib/rate-limiter.ts` (new):
   - Sliding-window in-memory rate limiter with TTL cleanup.
   - Integrate with `/api/auth/otp`, `loginAction`, `registerAction`, and `/api/generate/...`.
5. In `src/app/api/auth/otp/route.ts`:
   - Enforce `validateEmailDomain`.
   - Check `Blacklist` for banned IP and banned email.
   - Apply IP rate limiting.
6. In `src/middleware.ts`:
   - Add standard defensive security headers.

---

## 7. Automated Test Plan & Build Verification
1. Existing 33 tests in `tests/*.mjs` pass 100%.
2. New automated tests to add:
   - `test-15-ip-tracking-admin-isolation.mjs`: Verifies `firstLoginIp`, `firstLoginAt`, `lastLoginIp`, `lastLoginAt` capture and verifies public profile projection excludes all IP fields.
   - `test-16-academic-class-12-plus.mjs`: Verifies `"12+"` class level acceptance, filtering, and competitive exam activation.
   - `test-17-session-hmac-and-uuid-redaction.mjs`: Verifies session HMAC signing, rejection of forged session cookies, and redaction of `uuid` from public aspirant searches.
   - `test-18-rate-limiting-defense.mjs`: Verifies rate limiter sliding window triggers 429 when thresholds are exceeded.
   - `test-19-otp-domain-and-blacklist-defense.mjs`: Verifies `/api/auth/otp` rejects disallowed email domains and blacklisted entities.
3. TypeScript check (`npm run typecheck`): Clean 0 errors.
4. Production build (`npm run build`): Clean 0 errors.
