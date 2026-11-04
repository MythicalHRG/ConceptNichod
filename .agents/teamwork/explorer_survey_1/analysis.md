# Frontend, UI/UX, Theming & Academic Class Level Audit

**Explorer**: Explorer 1 (Frontend, UI/UX & Theming Explorer)  
**Date**: November 2026  
**Scope**: Read-only comprehensive survey of the ConceptNichod frontend architecture, theme system (6 themes), academic class levels ("12+"), UI/UX friction points, responsiveness, and Admin IP history views.

---

## Executive Summary

ConceptNichod is built on Next.js 14.2 (App Router) using React 18, TypeScript 5, Tailwind CSS 3.4, Radix UI primitives, Recharts, and `next-themes`. The application contains 5 main public/authenticated views (`/`, `/dashboard`, `/dashboard/concept-mirror`, `/dashboard/aspirants-connect`, `/dashboard/topic/[topicId]`, `/profile/[username]`, `/changelog`, and `/dashboard/admin`).

Our comprehensive audit revealed critical architectural and UI/UX findings:
1. **Theming Architecture**: While `next-themes` is installed, it is only configured for `light`, `dark`, and `system`. In `globals.css`, only `:root` (light) and `.dark` are defined. To support the six required themes (**Light**, **Dark**, **Midnight Neon**, **Sunset Amber**, **Forest/Emerald**, and **Cyberpunk/Indigo**), `ThemeProvider` must declare `themes={['light', 'dark', 'midnight-neon', 'sunset-amber', 'forest-emerald', 'cyberpunk-indigo']}`, full HSL variable suites must be added in `globals.css`, and Tailwind's `darkMode` must accommodate custom dark-base theme classes.
2. **Settings UI & Theme Switcher**: There is currently no dedicated `/settings` route; settings is a modal dialog inside `src/components/auth/user-profile-button.tsx` with only 3 tabs (`Profile`, `Password`, `Danger`). The theme switcher in `src/components/dashboard/navbar.tsx` is hardcoded to a 3-item dropdown (Light, Dark, System). A dedicated "Appearance" tab with visual theme cards and an upgraded Navbar theme selector are needed.
3. **Class Level "12+" Absence**: Academic class levels are inconsistent across views. In `src/app/dashboard/aspirants-connect/page.tsx:86`, `src/components/auth/user-profile-button.tsx:351`, `src/components/auth/login-dialog.tsx:453`, and `src/components/dashboard/add-topic-button.tsx:36`, "12+" is missing. Furthermore, Concept Mirror (`src/components/concept-mirror/mastery-dashboard.tsx`) lacks a class-level selector entirely, defaulting to "Unknown" or hardcoding "Class 11-12".
4. **UI/UX Friction Points**:
   - **Fatal Server Component Bug**: `src/app/dashboard/page.tsx:33` is an `async` Server Component passing an inline `onClick={() => window.location.reload()}` handler to a Button.
   - **FAB Collision**: The floating `AddTopicButton` (`bottom-8 right-8`) directly collides and overlaps with `BackgroundMusic` (`bottom-4 right-4 z-50`).
   - **Security Leak Risk**: `src/app/actions/profile.ts:12` uses negative projection (`.select("-password -email -uuid -_id -createdAt -__v")`), which will accidentally expose newly added IP tracking fields (`firstLoginIp`, `lastLoginIp`, `firstLoginAt`, `lastLoginAt`) to public profile viewers unless explicitly excluded.
5. **Admin Views**: `src/components/admin/admin-panel.tsx` currently only renders `u.lastKnownIp` without login timestamps or initial registration IP. The MongoDB `User` schema (`src/models/User.ts`) only has `lastKnownIp`.

---

## 1. Frontend Architecture & Component Directory Map

### 1.1 Page Routes and Layouts
- `src/app/layout.tsx`: Root application layout. Injects Google Fonts (`Playfair Display`, `PT Sans`), AdSense script, `ThemeProvider`, `NextTopLoader`, `SecurityGuard`, `AnimatedBackground`, `BackgroundMusic`, `AuthProvider`, `LoginDialog`, and `Toaster`.
- `src/app/page.tsx`: Marketing landing page featuring animated `FloatingBooks`, `Logo`, `FlippingBook`, and `DashboardButton`.
- `src/app/dashboard/layout.tsx`: Main authenticated layout with responsive `SidebarProvider`, `Sidebar`, `SidebarNav`, `UserProfileButton`, `Navbar`, and `AddTopicButton`.
- `src/app/dashboard/page.tsx`: User dashboard home displaying user profile card and `TopicHistory`.
- `src/app/dashboard/concept-mirror/page.tsx`: Concept Mirror AI speech evaluator and multi-chart cognitive analytics (`ConceptMirrorDashboard`).
- `src/app/dashboard/aspirants-connect/page.tsx`: Peer networking directory with search, class filter, gender filter, city filter, and profile cards.
- `src/app/dashboard/topic/[topicId]/page.tsx`: Active learning topic room with `TopicPageClient` (summary, timer, anti-cheating exam mode, practice questions, speech evaluator, analysis charts, and follow-up chat).
- `src/app/dashboard/admin/page.tsx`: Admin-only view with `AdminPanel` (Users, Bans, In-App Broadcasts, Email Broadcasts, Changelog).
- `src/app/profile/[username]/page.tsx`: Public learner profile displaying avatar badges, bio, and Recharts analytics (`UserAnalytics`).
- `src/app/changelog/page.tsx`: Platform version history and release notes (`ChangelogView`).

### 1.2 Styling & Theming Foundations
- **Tailwind Config** (`tailwind.config.ts`):
  - `darkMode: ['class']`
  - Font families: `body: ['"PT Sans"', 'sans-serif']`, `headline: ['"Playfair Display"', 'serif']`, `code: ['monospace']`.
  - Color tokens mapped directly to CSS variables using `hsl(var(--<token>))` (see Section 2).
  - Custom keyframes: `accordion-down`, `accordion-up`, `book-flip`, `blob`.
- **Global Styles** (`src/app/globals.css`):
  - Base layers: `:root` and `.dark` defining 19 core HSL color tokens.
  - Utility classes: `.book`, `.float-books`, `.shake`, `.dashboard-gradient`, `.test-in-progress`.
- **Theme Provider** (`src/components/theme-provider.tsx`):
  - Wraps NextThemesProvider from `next-themes`.

---

## 2. Six-Theme System Specification & Implementation Plan

### 2.1 The 6 Required Themes
The application must support exactly six themes:
1. **Light**: Clean, academic parchment/warm ivory aesthetic.
2. **Dark**: Sophisticated obsidian/charcoal dark mode.
3. **Midnight Neon**: Deep nocturnal void with high-contrast electric neon cyan/blue and magenta accents.
4. **Sunset Amber**: Twilight dusk / deep espresso background with rich warm golden amber and coral glow.
5. **Forest / Emerald**: Deep botanical evergreen/moss with vibrant emerald, mint, and sage accents.
6. **Cyberpunk / Indigo**: Futuristic dark indigo/violet void with vivid electric purple and hot magenta neon.

### 2.2 Color Token Architecture (globals.css)
Every theme must define the full set of 19 CSS variables in `src/app/globals.css`:

```css
/* ==========================================================================
   1. LIGHT THEME (:root or .light)
   ========================================================================== */
:root, .light {
  --background: 40 35% 95%;
  --foreground: 30 25% 10%;
  --card: 40 35% 97%;
  --card-foreground: 30 25% 10%;
  --popover: 40 35% 97%;
  --popover-foreground: 30 25% 10%;
  --primary: 45 90% 55%;
  --primary-foreground: 20 14% 10%;
  --secondary: 35 40% 90%;
  --secondary-foreground: 20 14% 10%;
  --muted: 35 40% 90%;
  --muted-foreground: 25 15% 45%;
  --accent: 35 60% 80%;
  --accent-foreground: 20 14% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 100%;
  --border: 35 20% 80%;
  --input: 35 20% 80%;
  --ring: 45 90% 55%;
  --radius: 0.5rem;
  --chart-1: 45 90% 55%;
  --chart-2: 35 80% 60%;
  --chart-3: 25 70% 45%;
  --chart-4: 40 90% 70%;
  --chart-5: 30 60% 35%;
  --sidebar-background: 40 35% 97%;
  --sidebar-foreground: 30 25% 10%;
  --sidebar-primary: 45 90% 55%;
  --sidebar-primary-foreground: 20 14% 10%;
  --sidebar-accent: 35 40% 90%;
  --sidebar-accent-foreground: 20 14% 10%;
  --sidebar-border: 35 20% 80%;
  --sidebar-ring: 45 90% 55%;
}

/* ==========================================================================
   2. DARK THEME (.dark)
   ========================================================================== */
.dark {
  --background: 30 25% 12%;
  --foreground: 40 35% 90%;
  --card: 30 25% 15%;
  --card-foreground: 40 35% 90%;
  --popover: 30 25% 10%;
  --popover-foreground: 40 35% 90%;
  --primary: 45 90% 55%;
  --primary-foreground: 20 14% 10%;
  --secondary: 30 25% 20%;
  --secondary-foreground: 40 35% 90%;
  --muted: 30 25% 20%;
  --muted-foreground: 35 15% 65%;
  --accent: 30 25% 25%;
  --accent-foreground: 45 90% 55%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 100%;
  --border: 30 25% 25%;
  --input: 30 25% 25%;
  --ring: 45 90% 55%;
  --sidebar-background: 30 25% 12%;
  --sidebar-foreground: 45 30% 95%;
  --sidebar-primary: 45 90% 55%;
  --sidebar-primary-foreground: 20 14% 10%;
  --sidebar-accent: 30 25% 20%;
  --sidebar-accent-foreground: 45 90% 55%;
  --sidebar-border: 30 25% 20%;
  --sidebar-ring: 45 90% 55%;
}

/* ==========================================================================
   3. MIDNIGHT NEON THEME (.midnight-neon)
   ========================================================================== */
.midnight-neon {
  --background: 224 71% 4%;
  --foreground: 180 100% 95%;
  --card: 224 60% 7%;
  --card-foreground: 180 100% 95%;
  --popover: 224 60% 6%;
  --popover-foreground: 180 100% 95%;
  --primary: 185 100% 50%;
  --primary-foreground: 224 71% 4%;
  --secondary: 224 45% 14%;
  --secondary-foreground: 185 100% 75%;
  --muted: 224 40% 12%;
  --muted-foreground: 215 25% 65%;
  --accent: 280 100% 65%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 224 45% 18%;
  --input: 224 45% 18%;
  --ring: 185 100% 50%;
  --chart-1: 185 100% 50%;
  --chart-2: 280 100% 65%;
  --chart-3: 320 100% 60%;
  --chart-4: 150 100% 50%;
  --chart-5: 45 100% 55%;
  --sidebar-background: 224 65% 5%;
  --sidebar-foreground: 180 80% 90%;
  --sidebar-primary: 185 100% 50%;
  --sidebar-primary-foreground: 224 71% 4%;
  --sidebar-accent: 224 45% 12%;
  --sidebar-accent-foreground: 185 100% 70%;
  --sidebar-border: 224 45% 15%;
  --sidebar-ring: 185 100% 50%;
}

/* ==========================================================================
   4. SUNSET AMBER THEME (.sunset-amber)
   ========================================================================== */
.sunset-amber {
  --background: 18 35% 7%;
  --foreground: 35 60% 94%;
  --card: 18 30% 10%;
  --card-foreground: 35 60% 94%;
  --popover: 18 30% 8%;
  --popover-foreground: 35 60% 94%;
  --primary: 32 95% 54%;
  --primary-foreground: 18 35% 7%;
  --secondary: 18 25% 16%;
  --secondary-foreground: 32 90% 80%;
  --muted: 18 25% 14%;
  --muted-foreground: 25 20% 65%;
  --accent: 350 85% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 80% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 18 25% 18%;
  --input: 18 25% 18%;
  --ring: 32 95% 54%;
  --chart-1: 32 95% 54%;
  --chart-2: 12 90% 60%;
  --chart-3: 350 85% 60%;
  --chart-4: 45 95% 60%;
  --chart-5: 280 60% 65%;
  --sidebar-background: 18 32% 8%;
  --sidebar-foreground: 35 50% 90%;
  --sidebar-primary: 32 95% 54%;
  --sidebar-primary-foreground: 18 35% 7%;
  --sidebar-accent: 18 25% 14%;
  --sidebar-accent-foreground: 32 95% 75%;
  --sidebar-border: 18 25% 16%;
  --sidebar-ring: 32 95% 54%;
}

/* ==========================================================================
   5. FOREST / EMERALD THEME (.forest-emerald)
   ========================================================================== */
.forest-emerald {
  --background: 155 35% 6%;
  --foreground: 145 40% 94%;
  --card: 155 30% 9%;
  --card-foreground: 145 40% 94%;
  --popover: 155 30% 7%;
  --popover-foreground: 145 40% 94%;
  --primary: 152 76% 50%;
  --primary-foreground: 155 45% 5%;
  --secondary: 155 25% 15%;
  --secondary-foreground: 150 60% 80%;
  --muted: 155 25% 13%;
  --muted-foreground: 150 15% 65%;
  --accent: 85 70% 50%;
  --accent-foreground: 155 45% 5%;
  --destructive: 0 80% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 155 25% 16%;
  --input: 155 25% 16%;
  --ring: 152 76% 50%;
  --chart-1: 152 76% 50%;
  --chart-2: 85 70% 50%;
  --chart-3: 175 70% 45%;
  --chart-4: 130 65% 55%;
  --chart-5: 45 85% 55%;
  --sidebar-background: 155 35% 7%;
  --sidebar-foreground: 145 35% 90%;
  --sidebar-primary: 152 76% 50%;
  --sidebar-primary-foreground: 155 45% 5%;
  --sidebar-accent: 155 25% 13%;
  --sidebar-accent-foreground: 152 76% 65%;
  --sidebar-border: 155 25% 14%;
  --sidebar-ring: 152 76% 50%;
}

/* ==========================================================================
   6. CYBERPUNK / INDIGO THEME (.cyberpunk-indigo)
   ========================================================================== */
.cyberpunk-indigo {
  --background: 260 45% 7%;
  --foreground: 270 50% 95%;
  --card: 260 40% 10%;
  --card-foreground: 270 50% 95%;
  --popover: 260 40% 8%;
  --popover-foreground: 270 50% 95%;
  --primary: 265 90% 66%;
  --primary-foreground: 0 0% 100%;
  --secondary: 260 30% 16%;
  --secondary-foreground: 270 80% 85%;
  --muted: 260 30% 14%;
  --muted-foreground: 265 20% 65%;
  --accent: 325 95% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 80% 58%;
  --destructive-foreground: 0 0% 100%;
  --border: 260 30% 18%;
  --input: 260 30% 18%;
  --ring: 265 90% 66%;
  --chart-1: 265 90% 66%;
  --chart-2: 325 95% 60%;
  --chart-3: 195 95% 55%;
  --chart-4: 290 85% 65%;
  --chart-5: 45 95% 55%;
  --sidebar-background: 260 45% 8%;
  --sidebar-foreground: 270 45% 90%;
  --sidebar-primary: 265 90% 66%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 260 30% 14%;
  --sidebar-accent-foreground: 265 90% 75%;
  --sidebar-border: 260 30% 16%;
  --sidebar-ring: 265 90% 66%;
}
```

### 2.3 Integration with `next-themes` and `tailwind.config.ts`
1. **In `src/app/layout.tsx`**:
   Update `<ThemeProvider>` declaration:
   ```tsx
   <ThemeProvider
     attribute="class"
     defaultTheme="system"
     enableSystem
     disableTransitionOnChange
     themes={[
       "light",
       "dark",
       "midnight-neon",
       "sunset-amber",
       "forest-emerald",
       "cyberpunk-indigo",
     ]}
   >
   ```
2. **In `tailwind.config.ts`**:
   Update `darkMode` so that Tailwind's `dark:` variant utilities trigger on all dark-base themes:
   ```ts
   darkMode: ['class', ':is(.dark, .midnight-neon, .sunset-amber, .forest-emerald, .cyberpunk-indigo)'],
   ```
   This ensures utilities like `dark:border-destructive` or `prose dark:prose-invert` function seamlessly on all 5 dark-base themes without code duplication.
3. **Persistence**:
   `next-themes` automatically persists to `localStorage.getItem('theme')`. Because `ThemeProvider` renders an inline script in `<head>`, there is zero Flash of Unstyled Content (FOUC) on client reload.

---

## 3. Settings UI & Theme Switcher Polish

### 3.1 Settings Dialog Upgrade (`user-profile-button.tsx`)
Currently, `UserProfileButton` opens a dialog with 3 tabs: Profile, Password, Danger.
To satisfy R3:
- Add an **"Appearance"** tab (`value="theme"`):
  - 4-column tab list: `Profile`, `Appearance`, `Password`, `Danger`.
  - Visual theme selector grid (2 columns on mobile, 3 columns on tablet/desktop).
  - Each theme card renders:
    - Theme title and description (e.g. "Midnight Neon — Deep cyan & violet glow")
    - Mini preview palette showing 3 circular swatches: Background, Card, Primary Accent.
    - Active selection indicator with checkmark badge and glowing border (`ring-2 ring-primary`).
    - Smooth click handler calling `setTheme(themeId)`.

### 3.2 Navbar Mode Toggle Upgrade (`src/components/dashboard/navbar.tsx`)
Currently, `Navbar` defines an inline `ModeToggle` with 3 items (Light, Dark, System).
- Replace with a full 6-theme picker dropdown menu.
- Display an icon representing each theme:
  - Light: `Sun`
  - Dark: `Moon`
  - Midnight Neon: `Zap`
  - Sunset Amber: `Flame`
  - Forest / Emerald: `Trees`
  - Cyberpunk / Indigo: `Cpu`
  - System: `Monitor`
- Highlight the active theme with a check icon.

---

## 4. Academic Class Level "12+" Audit & Modifications

### 4.1 Detailed Occurrences Survey
| Location | File & Line | Current Values | Required Update |
| :--- | :--- | :--- | :--- |
| **Aspirants Connect Filter** | `src/app/dashboard/aspirants-connect/page.tsx:86` | `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper"]` | Add `"12+"` to array: `["Class 9", "Class 10", "Class 11", "Class 12", "12+", "Dropper"]` |
| **Aspirants Connect Backend** | `src/app/actions/aspirants.ts:34-36` | `query.classLevel = filters.classLevel.trim()` | Already accepts dynamic string; once `"12+"` is sent, filters MongoDB correctly. |
| **Concept Mirror Frontend** | `src/components/concept-mirror/mastery-dashboard.tsx` | Missing class level input; hardcodes `classLevel="Class 11-12"` in `FollowUpChat:316` | Add Class Level `<select>` dropdown (`Class 9` to `12+` and `Dropper`), defaulting to user's classLevel, and pass to AI flow and `FollowUpChat`. |
| **Concept Mirror AI Flow** | `src/ai/flows/analyze-concept-explanation.ts:27` | `const { conceptName, userTranscript, classLevel = 'Unknown' } = input;` | Supports `classLevel: string`; will receive `"12+"` properly. |
| **User Registration Dialog** | `src/components/auth/login-dialog.tsx:453` | `["Class 1" ... "Class 12", "Dropper"]` | Add `"12+"`: `[..., "Class 12", "12+", "Dropper"]`. |
| **Competitive Exam Trigger** | `src/components/auth/login-dialog.tsx:461` | `{['Class 11', 'Class 12', 'Dropper'].includes(classLevel) && (` | Update to: `{['Class 11', 'Class 12', '12+', 'Dropper'].includes(classLevel) && (` |
| **User Profile Settings** | `src/components/auth/user-profile-button.tsx:351` | `["Class 9", "Class 10", "Class 11", "Class 12", "Dropper", "Other"]` | Add `"12+"`: `["Class 9", "Class 10", "Class 11", "Class 12", "12+", "Dropper", "Other"]`. |
| **New Topic Button** | `src/components/dashboard/add-topic-button.tsx:36` | `indianClasses = [..., "Class 11", "Class 12"]` | Add `"12+"` to `indianClasses`. |
| **Backend User Model** | `src/models/User.ts:31` | `classLevel: { type: String, required: true }` | Schema stores `String`; accepts `"12+"` with zero DB migration required. |
| **Backend Topic Model** | `src/models/Topic.ts:23` | `classLevel: { type: String, required: true }` | Schema stores `String`; accepts `"12+"`. |

---

## 5. UI/UX Friction Points & Layout Audits

### 5.1 Critical Server Component Bug (`src/app/dashboard/page.tsx:33`)
- **Bug**: `DashboardPage` is an `async` React Server Component. Line 33 renders `<Button onClick={() => window.location.reload()} className="mt-4">Refresh Page</Button>`.
- **Impact**: In Next.js App Router, passing an event handler prop (`onClick`) inside a Server Component throws an error or fails SSR serialization.
- **Fix**: Move the error/retry state into a Client Component or replace with a plain link/form `<a href="/dashboard">`.

### 5.2 FAB and Floating Audio Mute Button Collision
- **Bug**: `AddTopicButton` is fixed at `bottom-8 right-8` (`add-topic-button.tsx:119`). `BackgroundMusic` is fixed at `bottom-4 right-4 z-50` (`background-music.tsx:36`).
- **Impact**: On mobile devices and tablet viewports, the two floating buttons overlap. Tapping the "+" button to add a topic inadvertently toggles music playback.
- **Fix**: Move `BackgroundMusic` into the `Navbar` header (beside `ModeToggle` and `NotificationBell`) or move it to `bottom-4 left-4`.

### 5.3 Public Profile Data Security Leak Risk (`src/app/actions/profile.ts:12`)
- **Bug**: Line 12 uses negative selection: `.select("-password -email -uuid -_id -createdAt -__v")`.
- **Impact**: When R4 adds `firstLoginIp`, `lastLoginIp`, `firstLoginAt`, and `lastLoginAt` to the `User` schema, this query will return those fields to public visitors visiting `/profile/[username]`.
- **Fix**: Add `-lastKnownIp -firstLoginIp -lastLoginIp -firstLoginAt -lastLoginAt` to the `.select()` statement or use explicit field projection.

### 5.4 Mobile Responsive Sizing in Modal Dialogs
- `login-dialog.tsx` and `user-profile-button.tsx` use `max-h-[60vh] overflow-y-auto`. When the on-screen keyboard appears on mobile devices, 60vh is too small and causes clipped form controls.
- **Fix**: Upgrade to `max-h-[82vh]` with clean custom scrollbar.

### 5.5 Chart Overflow in Concept Mirror on Small Viewports
- In `src/components/concept-mirror/mastery-dashboard.tsx`, charts use fixed `h-[280px]` with margin padding. On viewports below 380px, PieChart labels can collide.
- **Fix**: Ensure `ResponsiveContainer` uses `min-w-0` and PieChart labels hide on `< 360px` viewports.

---

## 6. Admin Views & IP History Tracking

### 6.1 Current Admin Panel Layout
- Route: `/dashboard/admin` (`src/app/dashboard/admin/page.tsx`).
- Access: Authenticated via cookies and restricted to `user.username === "mythicalhrg"`.
- Action: `getAllUsersAction` in `src/app/actions/admin.ts` verifies admin session and selects `-password`.
- Component: `src/components/admin/admin-panel.tsx` renders a table with:
  - Username
  - Email
  - Name
  - IP Address (`{u.lastKnownIp || "Unknown"}`)
  - Joined Date
  - Delete Action

### 6.2 Required Upgrades for R4
1. **Schema Fields**:
   - `firstLoginIp`: String (recorded upon registration / first login)
   - `firstLoginAt`: Date (timestamp of initial registration / first login)
   - `lastLoginIp`: String (updated upon every successful authentication)
   - `lastLoginAt`: Date (timestamp of most recent authentication)
2. **Admin UI Rendering**:
   - Expand table in `AdminPanel` (`src/components/admin/admin-panel.tsx:320-365`):
     - Replace single "IP Address" column with structured columns:
       - **Initial Login**: `firstLoginIp || lastKnownIp` with `firstLoginAt` formatted date/time badge.
       - **Last Login**: `lastLoginIp || lastKnownIp` with `lastLoginAt` formatted date/time badge.
     - Include a tooltip or badge indicating if initial IP matches last login IP.
3. **Role & Endpoint Isolation**:
   - IP data must ONLY be retrieved via `getAllUsersAction()` protected by `verifyAdmin()`.
   - All other user-facing actions (`meAction`, `getPublicProfileData`, `searchAspirantsAction`) must strictly omit IP addresses and login history timestamps.
