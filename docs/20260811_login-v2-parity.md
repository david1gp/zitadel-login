# ZITADEL Login V2 parity

## Goal

Evolve `@adaptive-ds/zitadel-login` into a minimal SolidJS custom Login App covering the complete behavior required from upstream ZITADEL Login V2, while retaining native ZITADEL session/OIDC semantics, Contentoren organization branding, and a safe native Login V2 fallback during phased rollout.

## Approach

Compare the deployed ZITADEL `v4.16.0` Login V2 source route-by-route and API-by-API against the SolidJS project. Build a parity matrix first, then implement independently verifiable vertical phases. Keep upstream behavior and security semantics while simplifying presentation. Deploy each completed phase behind the application-specific Login App and preserve native fallback until parity and E2E coverage are complete.

## Tasks

1. **Completed** — Inventory upstream Login V2 routes, methods, state transitions, APIs, branding behavior, enabled Contentoren methods, and the current `allgroups-chat` integration.
2. **Completed** — Produce the target architecture and phased parity matrix; resolve incomplete `allgroups-chat` requirement and any high-impact product choices.
3. **Completed** — Implement the minimal application shell, Contentoren branding, switchable persistent dark mode, URL-addressable method chooser, and remembered non-secret login preferences/input.
4. **Completed** — Implement primary authentication parity: email OTP, username/password, passkeys, external IdPs, and existing-session/account selection.
5. **In progress** — Implement authentication continuation parity: TOTP, SMS/email OTP, U2F/passkeys, MFA selection/setup, and policy-driven steps.
6. **Pending** — Implement account lifecycle parity: registration, email verification, password reset/change, external-user linking, organization selection, and relevant error/consent flows.
7. **Pending** — Build upstream-parity tests, accessibility/browser coverage, and security regression coverage for all supported routes and transitions.
8. **Pending** — Deploy phased parity release, configure selected ZITADEL applications, and run live E2E across configured methods and Contentoren branding.
9. **Pending** — Complete documentation, final verification, commits, and push.

## Active paths

- Plan: `/home/david/adaptive/zitadel-login/docs/20260811_login-v2-parity.md`
- Project: `/home/david/adaptive/zitadel-login`
- ZITADEL source: `/home/david/opensource/zitadel`
- ZITADEL deployment: `/home/david/leo_internal/contentoren-server/zitadel`
- Related application: `/home/david/leo_own/allgroups-chat`
- Production login: `https://login.contentoren.de`
- Native fallback: `https://auth.contentoren.de/ui/v2/login`

## Durable decisions

- Follow the code-style skill before writing or refactoring TypeScript/TSX.
- Port behavior and security semantics from ZITADEL Login V2 into SolidJS; do not port React/Next.js implementation details blindly.
- Keep the visual design more minimal than the current portal and remove excessive reassurance copy such as “Protected by ZITADEL” and “Your code is used only to complete this sign-in.”
- Provide a user-switchable light/dark mode and persist the choice in localStorage.
- Start with a login-method chooser; reveal method-specific fields only after selection.
- Represent the selected method in the URL path or query so it is bookmarkable and revisitable.
- Remember the selected method and appropriate non-secret input such as email in localStorage for faster repeat login. Never persist passwords, OTPs, WebAuthn challenges, tokens, or authorization-request state.
- Render the custom branding configured for the default Contentoren organization through native ZITADEL settings APIs, with safe minimal fallbacks.
- Preserve native ZITADEL Login V2 as fallback during phased implementation and verification.
- Current Contentoren primary methods are username/password, passwordless, Google, and GitHub. Enabled continuation methods include TOTP, U2F, email OTP, recovery codes, and verified U2F; registration and password recovery are enabled.
- Load branding dynamically from native organization/default label-policy APIs. Current inherited branding provides light/dark logos and icons, light/dark color palettes, automatic theme mode, and no watermark.
- Upstream parity covers primary login, sessions/accounts, password and passkey lifecycle, MFA selection/setup, OTP/U2F, external IdP linking/registration/failure, registration/email verification, device authorization, logout, OIDC/SAML request semantics, localization, and classified errors.
- `allgroups-chat` currently uses independent Convex authentication with email OTP, password, GitHub, Google, custom JWT sessions, and no ZITADEL/OIDC integration.
- Keep `allgroups-chat` authentication self-contained and unchanged. Use its UI component style, `SignalObject`, URL/path/query state management, Result usage, and general SolidJS patterns only as implementation references where they conform to the code-style skill.
- Architecture reference: `/home/david/adaptive/zitadel-login/docs/20260811_login-v2-architecture.md`.
- Use capability-first bounded contexts, versioned `/api/v2` Result contracts, Worker-owned native orchestration, encrypted bounded cookies, canonical URL state, validated non-secret localStorage preferences, and capability-gated fallback only before native request mutation.
- Recovery-code checks remain on native Login V2 fallback until a supported v4.16 custom-login API is established.
- `/api/v2/bootstrap` is the display-safe, validated Result endpoint for effective organization branding, light/dark colors and assets, enabled primary methods, and external IdP summaries; Worker credentials remain private and bootstrap responses are bounded-cached.
- Canonical method routes are `/login/email-otp`, `/login/password`, `/login/passkey`, and `/login/idp/:provider`; the chooser remains `/login`.
- Persist theme under a versioned validated key and login preferences under an organization-scoped validated key. Identifier persistence remains explicit opt-in and excludes credentials and flow state.
- The minimal shell dynamically shows Contentoren-enabled email OTP, password, passkey, Google, and GitHub choices; method routes are bookmarkable, native branding is applied, and light/dark/system preferences persist safely.
- Browser navigation, location, focus, initialization, query filtering, and preference persistence use bounded Result-returning adapters/controllers rather than unbounded component state.
- Versioned email authentication uses opaque 128-bit flow handles, per-handle encrypted HttpOnly cookies with key rotation, Worker-owned callbacks/fallbacks, strict capability gates before mutation, native Session verification, replay/expiry controls, and HMAC-opaque rate limits; v1 remains available during migration.
- The client now consumes `authRequest` once, canonicalizes to `/login/email-otp?flow=<opaque>`, resumes through the v2 Worker contract after reload/history navigation, keeps CSRF only in memory, and stores no flow/auth/OTP data in localStorage.
- Password authentication is opt-in behind `ZITADEL_PASSWORD_V2_ENABLED`; the Worker performs native password checks, stores only the latest session token in encrypted flow state, returns generic credential failures, and prevents authorization completion when policy/MFA continuation is required.
- Passkey challenge creation is opt-in behind `ZITADEL_PASSKEY_V2_ENABLED`; the Worker validates RP ID/origin and native WebAuthn options, seals required Session continuation in the flow cookie, and returns only browser-safe PublicKeyCredentialRequestOptions.
- Passkey assertion verification validates `webauthn.get`, expected challenge, exact Pages origin, RP-bound user handle, stage/replay state, and native ZITADEL Session results before authorization or MFA continuation.
- External IdP initiation is opt-in behind `ZITADEL_IDP_V2_ENABLED`; providers are revalidated against effective organization settings, native intent return URLs remain Worker-owned, and encrypted flow state stores only bounded provider metadata.
- Worker-owned IdP callbacks consume native intent tokens server-side, correlate provider/organization/flow, create Sessions only for linked users, scrub token-bearing URLs, and retain explicit MFA or unlinked-account transitions without automatic linking.
- The SolidJS IdP panel starts Google/GitHub intents only on explicit action, persists only the selected provider preference, rejects unknown routes before mutation, and handles clean failure/unlinked/MFA returns without exposing intent state.
- Successful v2 authorization can opt into an independently encrypted `__Host-zitadel-login-accounts` cookie containing at most three minimal native Session continuations for 30 days; tokens remain HttpOnly, key-rotatable, and never enter browser responses or logs.
- During initialize/resume, recent native Sessions are revalidated against active user/organization state, hints, prompt, and max-age; the browser receives only opaque selection IDs and display-safe summaries while stale entries are pruned.
- Account selection resolves only through the encrypted cookie: sufficient Sessions complete authorization, while prompt/max-age requirements produce a user-bound reauthentication transition without exposing native identifiers or tokens.
- `ZITADEL_MFA_V2_ENABLED` is an explicit default-off ownership gate. User-known primary methods preflight policy and enrolled factors before mutation; IdPs are not advertised or started until MFA continuation is owned, preventing users from being stranded in an unsupported post-primary branch.
- `/api/v2/mfa/options` refreshes native Session/user/policy state and projects only display-safe `check`, `select`, `enroll`, `skip`, or fallback continuations for TOTP, email/SMS OTP, U2F, and passkey; recovery-code and unknown branches remain safe fallback.
- Enrolled TOTP continuation performs the native Session check, retains the latest token, re-evaluates policy satisfaction, and either completes authorization or returns the next MFA transition; the client keeps six-digit codes memory-only.
- Enrolled email-OTP continuation uses explicit native challenge/resend actions and 6–20 digit verification, prevents primary-factor reuse, keeps contact/code state private, and re-evaluates policy before completion or next-factor routing.
- Enrolled SMS-OTP continuation mirrors explicit native challenge/resend and 6–20 digit verification while keeping phone/code data private and re-evaluating policy before completion.
- Enrolled U2F and verified-U2F/passkey continuation uses native WebAuthn challenges, exact RP/origin/challenge checks, user-presence versus user-verification semantics, memory-only browser assertions, and policy re-evaluation before completion.
