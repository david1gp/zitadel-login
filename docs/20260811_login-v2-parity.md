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
5. **Completed** — Authentication continuation verification, MFA selection, policy-driven optional setup skipping, and secure TOTP, U2F/passkey, and email OTP enrollment are complete. Enrolled SMS verification remains supported; new SMS enrollment is deferred in favor of email OTP.
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
- Optional MFA setup offers a policy-authorized “Skip for now” action that posts the memory-only CSRF token as credentialed JSON to `/api/v2/mfa/skip`; the Worker revalidates policy, records native `HumanMFAInitSkipped`, and rejects forced-setup skips. Component coverage locks this browser request contract.
- MFA enrollment requires a freshly revalidated trusted Session and remains bound to the flow, user, organization, transition, and expiry. Setup material and entered codes stay memory-only and must never be logged or persisted.
- TOTP is the first enrollment vertical: authorize setup, create native setup material, show QR/manual provisioning details, verify a six-digit code, then re-evaluate policy and continue. Unsupported native enrollment capabilities fall back safely before mutation.
- ZITADEL v4.16 exposes TOTP enrollment through authenticated user APIs: `POST /v2/users/{userId}/totp` returns the provisioning URI/secret and `POST /v2/users/{userId}/totp/verify` verifies the setup code. These APIs are not Session-bound, so the Worker must prove the trusted flow, Session, user, organization, transition, and policy binding before each native mutation.
- The Worker ZITADEL client exposes strictly validated `totpEnrollmentCreate` and `totpEnrollmentVerify` operations; user IDs, six-digit codes, provisioning data, native details, and failure metadata are bounded at the adapter boundary.
- `POST /api/v2/mfa/otp/enroll` reauthorizes the trusted Session and current enrollment policy before mutation, advances to an encrypted one-time `mfa_totp_setup` transition, and returns provisioning URI/secret only in the immediate response without persisting or logging them.
- TOTP setup verification and Session satisfaction are separate native operations: first verify registration through the user API, then submit the same current code through Session `SetSession` to record `TOTPChecked`, retain the rotated Session token, and re-evaluate policy before continuing.
- `POST /api/v2/mfa/otp/enroll/verify` owns TOTP setup completion. If registration activates but Session verification fails, the flow advances to recoverable enrolled-TOTP verification without completing authorization or replaying registration.
- The TOTP client enrollment screen starts only after explicit user action, renders the provisioning URI locally as a QR code with an accessible manual secret, and keeps setup material/code in memory only. A resumed `mfa_totp_setup` stage is authoritative: the client skips options loading and offers safe native fallback instead of persisting, reconstructing, or replaying enrollment.
- TOTP QR rendering uses a dependency-free-at-runtime local SVG matrix generated by `qrcode-generator`; no setup material is sent to an external image service or browser storage, and the manual key is hidden until explicitly revealed.
- U2F and verified-passkey enrollment share flow authorization, WebAuthn creation-option/attestation serialization, encrypted one-time setup state, and policy continuation, while retaining distinct native registration APIs and semantics: U2F requires user presence; verified passkeys require both user presence and user verification.
- Native WebAuthn registration activation does not itself satisfy the Login Session. Post-registration handling must avoid replay, confirm the enrolled factor, perform or route to the corresponding Session check, retain any rotated token, and complete only after policy re-evaluation.
- The Worker ZITADEL client now exposes strictly bounded U2F and passkey registration start/verification operations. Native creation options must match the configured RP domain, verified-passkey options must require user verification, and attestation payloads and errors are bounded at the adapter boundary.
- U2F/passkey enrollment-start routes reauthorize trusted setup and current policy before native mutation, then seal method, registration correlation, RP/challenge, Session/user/organization binding, transition counter, and expiry in encrypted one-time flow state while returning only browser-safe creation options.
- WebAuthn registration verification locally binds `webauthn.create` to the sealed challenge and exact origin and requires UP for U2F plus UP/UV for verified passkeys before native activation. Registration attestations cannot satisfy a Session; successful activation must transition to a fresh native `webauthn.get` challenge and the existing assertion verification flow.
- U2F/passkey enrollment verification additionally checks the sealed RP hash and credential ID, consumes registration state before native activation, and routes partial success to recoverable enrolled-factor verification without replay. The check-after assertion retains rotated Session tokens and re-evaluates policy before completion.
- The WebAuthn enrollment UI must use an explicit user action for `navigator.credentials.create`, preserve native creation requirements, serialize only bounded attestation fields, and hand registration success to a fresh `navigator.credentials.get` assertion. Setup options, attestations, names, and CSRF remain memory-only; resumed setup offers safe fallback without ceremony replay.
- U2F/passkey registration now hands the Worker-provided fresh assertion options directly to the existing assertion panel without issuing a duplicate challenge request. Registration and assertion ceremonies are independently guarded, browser cancellation is recoverable, and desktop/mobile browser coverage locks ordering and non-persistence.
- Browser cancellation retains the current Worker-issued creation options in component memory so an explicit retry does not create a duplicate native registration challenge; options are cleared after verification or cleanup.
- Email OTP enrollment uses the user's freshly revalidated verified primary email and native `POST /v2/users/{userId}/otp_email`; enrollment itself sends no code and does not satisfy the Session. The custom flow must then issue and verify a separate native Session email challenge before policy continuation.
- Email OTP cannot be enrolled to satisfy continuation when email OTP was the successful primary factor. The Worker enforces this sealed-factor reuse restriction, server-side challenge/resend limits, and one-time post-enrollment recovery; the browser never supplies the enrollment email.
- The ZITADEL client exposes bounded `addOTPEmail`, with stable non-sensitive classification for already-enrolled, unverified-email, permission, and service failures.
- `POST /api/v2/mfa/email-otp/enroll` activates only a freshly authorized, verified-email factor that was not used as the primary factor, then issues a native Session challenge and advances to one-time enrollment-aware code state. Partial activation never replays enrollment, and post-check policy token rotation is retained.
- Email OTP enrollment begins only on explicit action and sends method plus memory-only CSRF without an email. Because the Worker has already issued the Session challenge, the client enters the shared code/resend/verify panel directly without a duplicate challenge request.
- After activation, encrypted `mfa_email_otp_code` state is authoritative: reload resumes directly at code verification, options loading is suppressed, and enrollment replay is rejected before native mutation.
- Task 5 SMS enrollment supports only an existing freshly revalidated verified primary phone through native `POST /v2/users/{userId}/otp_sms`; the browser supplies no phone. Phone capture, normalization, replacement, and phone verification belong to Task 6 account lifecycle, with safe fallback when no verified phone exists.
- SMS factor activation does not satisfy the Session. The Worker must consume activation once, issue a native Session SMS challenge, retain token rotation, reuse the existing resend/verify path, and recover from post-activation challenge failure without replaying enrollment.
- New SMS OTP enrollment is intentionally deferred; Contentoren will use email OTP instead. Existing enrolled SMS factors remain usable for verification, but SMS must not be advertised as a custom enrollment option until its route and UI are deliberately resumed.
- Enrolled TOTP continuation performs the native Session check, retains the latest token, re-evaluates policy satisfaction, and either completes authorization or returns the next MFA transition; the client keeps six-digit codes memory-only.
- Enrolled email-OTP continuation uses explicit native challenge/resend actions and 6–20 digit verification, prevents primary-factor reuse, keeps contact/code state private, and re-evaluates policy before completion or next-factor routing.
- Enrolled SMS-OTP continuation mirrors explicit native challenge/resend and 6–20 digit verification while keeping phone/code data private and re-evaluating policy before completion.
- Enrolled U2F and verified-U2F/passkey continuation uses native WebAuthn challenges, exact RP/origin/challenge checks, user-presence versus user-verification semantics, memory-only browser assertions, and policy re-evaluation before completion.
