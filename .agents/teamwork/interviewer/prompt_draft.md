Comprehensive audit and upgrade of the ConceptNichod project (https://github.com/MythicalHRG/ConceptNichod.git) to eliminate bugs, strengthen security, improve UI/UX, record user login IP history, add the "12+" academic class level, and achieve full automated test verification and clean builds.

Working directory: c:\Users\Neha\Downloads\ConceptNichod
Integrity mode: development

Repository: https://github.com/MythicalHRG/ConceptNichod.git

## Requirements

### R1. Full-Stack Audit, Bug Resolution, and Edge Case Fixes
Audit the entire application across all frontend, backend, database, and authentication flows. Identify and resolve remaining bugs, glitches, edge cases, and vulnerabilities.

### R2. Security Layer Hardening
Strengthen application security with defensive layers:
- Rate limiting on sensitive and auth endpoints
- Session security hardening
- Comprehensive input validation and sanitization
- Strict role isolation and access control

### R3. UI/UX Friction Resolution and Theming System
Identify and resolve user friction points, UX issues, missing features, and lagging areas. Implement a rich theme system supporting exactly six themes: Light, Dark, Midnight Neon, Sunset Amber, Forest/Emerald, and Cyberpunk/Indigo, with persistent theme selection, settings page improvements, animations, and responsive polish.

### R4. IP and Login Timestamp Tracking
Record users' initial registration/first login IP and last login IP along with respective timestamps in the MongoDB schema. Restrict the display of this IP and timestamp data securely to Admin views only.

### R5. Academic Class Level "12+"
Add "12+" as an academic class level across the application, including drop-down selection, schema validation, and filtering across Aspirants Connect, Concept Mirror, and user profile.

### R6. Automated Test Coverage, Typecheck, and Clean Build
Maintain a 100% pass rate across automated test suites. Write automated tests covering all new features, security layers, and audit bug fixes, while utilizing existing repository tests. Ensure TypeScript typecheck and production build pass cleanly with zero errors.

## Acceptance Criteria

### Audit & Security
- [ ] All identified bugs, glitches, edge cases, and security vulnerabilities across frontend, backend, database, and authentication flows are resolved.
- [ ] Rate limiting is enforced on sensitive and auth routes.
- [ ] Session security measures are implemented and verified.
- [ ] Input validation is enforced across all API routes and form submissions.
- [ ] Role isolation prevents unauthorized access to privileged routes, endpoints, and operations.

### UI/UX & Theming
- [ ] The six themes (Light, Dark, Midnight Neon, Sunset Amber, Forest/Emerald, Cyberpunk/Indigo) are selectable and render with appropriate color schemes and styling across all application views.
- [ ] Selected theme persists across page reloads and user sessions.
- [ ] Settings page updates, UI animations, and responsive layout polish function smoothly across mobile, tablet, and desktop viewports without visual regression.

### IP and Login Tracking
- [ ] User document in MongoDB contains fields recording the first login IP (registration/initial IP) and last login IP with their respective timestamps.
- [ ] First login IP, last login IP, and timestamps update accurately on user registration and authentication.
- [ ] Login IP and timestamp information is displayed in Admin views and is not exposed to non-admin users.

### Academic Class Level "12+"
- [ ] "12+" is available as a selectable option in academic class level drop-downs.
- [ ] Backend and frontend validation schemas accept "12+" as a valid class level.
- [ ] Filtering by "12+" functions correctly in Aspirants Connect, Concept Mirror, and user profile.

### Automated Testing and Build Verification
- [ ] All automated tests (existing tests plus new tests covering audit fixes, security layers, themes, IP tracking, and class level additions) pass cleanly with a 100% pass rate (0 failures).
- [ ] TypeScript typecheck (`tsc --noEmit` or equivalent) executes with 0 errors.
- [ ] Production build (`npm run build`) completes successfully with 0 errors.
