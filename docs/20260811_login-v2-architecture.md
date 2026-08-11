# Login V2 implementation architecture

## Status and scope

This is the implementation contract for parity with ZITADEL Login V2 `v4.16.0`. It completes Task 2 of `20260811_login-v2-parity.md`; it does not change that plan or implement any runtime behavior.

The parity baseline is the local tag `v4.16.0` at commit `02d07e951b0b6ff8d5fa5e74b65209a8e9efddfe`, specifically `apps/login`. The local checkout's working tree is newer, so all upstream references below were verified against the tagged Git objects rather than the checked-out files.

Other inspected sources:

- Current project: `client/src`, `src`, and `test` in this repository.
- SolidJS architecture references only: `ui/utils/createSignalObject.ts`, `src/utils/cache/createLocalStorageSignalObject.ts`, `src/utils/cache/createQueryCached.ts`, `src/utils/router`, `src/groups/ui/submit`, and `src/auto_anti_spam/ui/form` in `/home/david/leo_own/allgroups-chat`.
- Code-style skill: one export per file, capability bounded contexts, subject-first exported names, owned `Result`, early returns, `SignalObject`, validated browser persistence and URL state, and view-only TSX.

`allgroups-chat` authentication is not a dependency, migration target, or integration point. No file under its `src/auth`, `convex/auth.ts`, or authentication deployment is to be imported, copied, or modified. Its generic SolidJS state-factory, `SignalObject`, URL helper, validated cache, and form-state separation patterns are references only.

## Durable decisions

1. Treat upstream behavior and native ZITADEL policy as the specification, not its Next.js/React structure.
2. Keep static SolidJS on Pages and all privileged orchestration in the same-origin Hono Worker. The browser never receives a ZITADEL machine credential or session token.
3. Keep ZITADEL as the sole identity, credential, challenge, session, OIDC, SAML, and device-authorization authority. The Worker coordinates native APIs; it does not implement an identity system.
4. Use capability bounded contexts rather than route folders or a single `login` context. Routes compose capabilities; they do not own domain behavior.
5. Add versioned `/api/v2/*` contracts beside the deployed `/api/*` email-OTP API. Remove v1 only after the new client and rollback window no longer need it.
6. Make each capability opt-in behind a server-side ownership gate. Delegate to native Login V2 before any mutation when the complete remaining flow is not owned.
7. Use one encrypted, host-only continuation cookie per active flow and a separate encrypted, bounded account-session cookie. Do not use localStorage, sessionStorage, URL payloads, KV, or Durable Objects for secrets.
8. Use a random `flow` handle in canonical URLs only to select the corresponding encrypted cookie. The handle is not sufficient without that cookie. Scrub inbound auth request IDs, intent tokens, verification codes, and logout tokens from the address bar immediately after Worker consumption.
9. Preserve exact OIDC, SAML, prompt, organization-scope, callback, and device semantics. Validate callback destinations against the native request, not a generic origin allowlist alone.
10. Expose only minimal validated UI projections of login settings and branding. Security and policy decisions stay in the Worker and are never trusted from cached browser data.
11. Use a user-selected `light`, `dark`, or `system` preference. Explicit user choice wins when upstream branding mode is `AUTO` or `UNSPECIFIED`; forced upstream `LIGHT` or `DARK` wins and disables the switch with an explanation.
12. Remember only non-secret preferences and an explicitly permitted login identifier. Never persist passwords, OTPs, WebAuthn data, IDP intent data, tokens, request IDs, CSRF values, or callback URLs.
13. Preserve generic errors where policy requires user-enumeration resistance. Stable error codes are for UI behavior and telemetry, not more revealing messages.
14. Recovery codes are not part of the v4.16 Login V2 source baseline: the tagged app contains no recovery-code route, action, component, or acceptance test. Contentoren may have recovery codes enabled, but they remain a native fallback capability unless a separate product/API contract is approved.
15. Do not cut over SAML, device authorization, external providers, or a policy branch merely because its first screen exists. Ownership means every success, error, retry, setup, and completion branch for that slice is implemented and tested.

## Bounded contexts

The chosen cut is capability-first. A route-first cut was rejected because session mutation, policy continuation, callback completion, branding, and error classification cross many routes. A broad `authentication` context was rejected because it would become an unbounded replacement for the current 623-line `workerAppCreate.ts`.

| Context | Owns | Does not own |
| --- | --- | --- |
| `flow` | OIDC/SAML request ingestion, prompt handling, organization scope, stage transitions, completion, safe fallback | Credential checks or provider ceremonies |
| `session` | Native session create/get/set/list/delete, encrypted account registry, account selection, logout | OIDC/SAML request interpretation |
| `discovery` | Login-name lookup, org-domain discovery, method availability, anti-enumeration decisions | Password or passkey verification |
| `email-otp` | Primary email OTP challenge, resend, verification | Email verification for account lifecycle |
| `password` | Password checks, reset request, set/change-required flows, complexity/expiry projection | User registration |
| `webauthn` | Browser ceremony serialization and validation for primary passkeys and U2F; registration and assertion adapters | Policy deciding whether WebAuthn is primary or MFA |
| `identity-provider` | Active IDPs, intent start/callback, LDAP, linking, auto-create, incomplete registration, classified failures | Local credentials |
| `mfa` | Factor choice, TOTP/SMS/email OTP checks and enrollment, U2F policy placement, skip policy | Generic WebAuthn ceremony mechanics |
| `registration` | Local registration, optional password/passkey selection, privacy acceptance | Existing-user verification |
| `verification` | Email/invite verification, resend, success continuation | Primary email OTP sign-in |
| `device-authorization` | User-code lookup and approve/deny consent | OIDC browser authorization requests |
| `branding` | Default/org branding, legal links, public settings projection, cache policy | Security authorization decisions |
| `localization` | Locale negotiation, messages, hosted-login translations, formatting direction | Theme or branding |
| `preferences` | Validated non-secret local preferences | Any continuation or server state |
| `app` | Composition root, route rendering, context-neutral layout and error boundary | Domain branching |
| `http` | Hono boundary, headers, CSRF/origin checks, Result-to-response mapping | Domain decisions |
| `result` | Project-owned Result constructors and schemas | HTTP status selection |

Dependencies point inward from `app`/`http` to context domain operations. Contexts may depend on `result`; browser contexts may depend on context-neutral `ui`. Cross-context transitions go through `flow`, not direct route redirects hidden inside credential contexts.

## Module layout

Top-level folders are bounded contexts under both runtime roots. Each exported schema, type-bearing schema, function, object, component, or state factory has one same-named file. There are no `types.ts`, `utils.ts`, `actions.ts`, or multi-export barrels. Valibot schemas export their inferred type from the same file as the schema.

```text
client/src/
  app/
    ui/App.tsx
    ui/appStateCreate.ts
    model/appRouteSchema.ts
  flow/
    api/flowInitializeRequest.ts
    api/flowResumeRequest.ts
    model/flowTransitionSchema.ts
    ui/FlowRouter.tsx
    ui/flowRouterStateCreate.ts
  email-otp/
    model/emailOtpStartInputSchema.ts
    ui/EmailOtpPage.tsx
    ui/emailOtpPageStateCreate.ts
  webauthn/
    model/webAuthnAssertionSchema.ts
    model/webAuthnRegistrationSchema.ts
    ui/PasskeyPage.tsx
    ui/passkeyPageStateCreate.ts
  branding/
    model/brandingViewSchema.ts
    ui/BrandLogo.tsx
  preferences/
    model/loginPreferenceSchema.ts
    model/loginPreferenceLoad.ts
    model/loginPreferenceSave.ts
  ui/
    Button.tsx
    TextField.tsx
    createSignalObject.ts

src/
  flow/
    model/flowCookieSchema.ts
    domain/flowInitialize.ts
    domain/flowComplete.ts
    zitadel/oidcAuthRequestGet.ts
    http/flowRoutesRegister.ts
  session/
    model/accountSessionCookieSchema.ts
    domain/sessionCreate.ts
    zitadel/zitadelSessionCreate.ts
    http/sessionRoutesRegister.ts
  identity-provider/
    model/identityProviderIntentSchema.ts
    domain/identityProviderIntentProcess.ts
    zitadel/identityProviderIntentStart.ts
  branding/
    model/brandingViewSchema.ts
    domain/brandingViewGet.ts
    zitadel/brandingSettingsGet.ts
  http/
    workerAppCreate.ts
    resultResponseCreate.ts
  result/
    Result.ts
    resultCreate.ts
    resultErrorCreate.ts
```

Names above are the target convention, not a requirement to create empty modules in advance. Add a file only with its vertical slice. Framework-required composition exports such as the Worker entry point remain allowed exceptions.

### View-only TSX

Every exported `.tsx` component body contains one state-factory call and JSX. Signals, memos, effects, lifecycle hooks, parsing, API calls, navigation, event behavior, and derived data live in the sibling `<subject>StateCreate.ts`. Props that may change are passed to the factory as accessors. Factories return accessors, `SignalObject`s where a child edits a value, and purpose-named handlers; they never expose raw setters as unrelated callbacks.

Small presentational components with no state need no factory. JSX-returning helpers may stay in TSX; data helpers do not. Shared page state is created once by the page and passed to desktop/mobile or sub-form views. This applies the code-style rule more strictly than the inspected `allgroups-chat` examples, while retaining their useful page-factory and `SignalObject` shape.

## Result ownership

The repository's `Result<T>` remains the only fallible domain return shape:

```text
ResultOk<T>  = { success: true, data: T }
ResultErr    = { success: false, op: string, errorMessage: string, rawData?: unknown }
```

- Every fallible exported function starts with a stable subject-first `op` and returns early.
- Throwing I/O is caught only in the adapter that calls `fetch`, Web Crypto, WebAuthn, localStorage, or another throwing API.
- Valibot `safeParse` failures become owned errors at deserialization boundaries.
- Domain callers propagate `if (!result.success) return result` and never catch Result failures.
- Expected policy outcomes are successful `FlowTransition` values such as `render`, `navigate`, `fallback`, or `complete`; they are not errors.
- Hono maps internal error codes to status and a safe public message once. `rawData`, upstream bodies, tokens, identifiers, and classified details are never serialized or logged.
- Browser `/api/v2` JSON uses the same discriminated Result envelope. Redirect/HTML continuation endpoints are the only exceptions.
- Existing `/api/*` response shapes remain unchanged until their deployed client is retired.

## Reactive and browser state

Use `createSignalObject<T>(initial): { get; set }` for mutable Solid state. The current `signalObjectCreate` is migrated only when its v2 consumer is introduced; do not add both conventions to new code. App-global state is limited to branding, localization, preferences, and the current public flow projection. Credential form state remains page-local.

State precedence is:

1. Worker-owned encrypted continuation state.
2. Valid canonical path/query state.
3. Valid non-secret local preference.
4. Upstream request hints or system defaults.

The server transition always wins over a stale browser route. On resume, the browser replaces the URL with the canonical route returned by the Worker.

## URL contract

All routes are under `/login`; `/api` is reserved for the Worker. Every screen and tab has a path. Dialogs and search use validated query parameters and `history.replaceState`; user-selected screen navigation uses push history; automatic policy transitions use replace history.

Allowed common query keys:

| Key | Contract |
| --- | --- |
| `flow` | Required after initialization; 128-bit base64url opaque handle selecting a same-handle host-only cookie |
| `dialog` | Closed enum owned by the current route; opening/closing uses replace state |
| `q` | Non-secret local list search only; max 100 characters; replace state |

Ingress-only keys are `authRequest`, `samlRequest`, `requestId`, `user_code`, `logout_token`, `code`, `id`, and `token`. They are accepted only on their designated ingress route, sent to the Worker, and removed with `history.replaceState` before rendering normal content. Unknown, duplicate, malformed, or route-inappropriate keys produce a safe error or new-flow instruction; they are never forwarded.

Canonical route state must not contain a password, OTP, email/invite code, WebAuthn challenge or response, IDP intent token, session token, callback URL, raw OIDC/SAML request ID, CSRF token, or login identifier. The selected primary method is represented by its path, for example `/login/email-otp?flow=...`, and is also remembered as a preference.

Back/forward navigation changes presentation only. Before accepting an action, the Worker checks the encrypted stage and returns the canonical route if the browser is stale. A browser history entry can never roll back a native session or replay a completed check.

## localStorage contract

Only these versioned subjects may be persisted:

| Key shape | Data | Lifetime |
| --- | --- | --- |
| `zitadel-login:theme:v1` | `light`, `dark`, or `system`; `updatedAt` | Until changed |
| `zitadel-login:locale:v1` | Supported BCP 47 language tag; `updatedAt` | Until changed |
| `zitadel-login:preference:v1:<organization-or-default>` | selected method, remember-identifier choice, optional normalized identifier, `updatedAt` | Identifier expires after 180 days |
| `zitadel-login:bootstrap:v1:<instance>:<organization>:<locale>` | public branding/settings/translation projection and `updatedAt` | Stale display allowed for 24 hours; refresh immediately |

Rules:

- Validate key-derived scope and parsed JSON with Valibot. Invalid, expired, oversized, or wrong-version data is ignored and removed when possible.
- Wrap reads/writes in Result-returning adapters because storage can throw or be unavailable.
- Debounce writes and schedule them with `requestIdleCallback`, with a timeout fallback.
- Listen for `storage` events for theme and locale and unregister listeners on cleanup.
- Persist the login identifier only when the user enables remembering it. Never infer consent from an upstream `loginHint`.
- Clear a remembered identifier on explicit "forget", not on successful login. Clear credential form state on every navigation and submission attempt; credential form state is never persisted.
- The bootstrap cache is display-only. The Worker independently re-evaluates current policy for every transition.
- Send the cache's `updatedAt` to bootstrap refresh. The Worker returns `null` for unchanged subjects.

## Worker/domain contract

### Common transition

All JSON mutations require same-origin `Origin`, JSON content type, bounded body size, a CSRF token bound to the encrypted flow, and rate limits keyed by HMAC-opaque flow/IP/subject values. GET bootstrap/resume responses are `no-store`; public branding assets may be cached separately.

`FlowTransition` is a validated variant:

| Kind | Data | Browser behavior |
| --- | --- | --- |
| `render` | canonical route, public screen model, CSRF token | Replace stale URL and render |
| `navigate` | same-origin relative path | Top-level assign for Worker continuation or push/replace as declared |
| `form_post` | same-origin Worker continuation path only | Top-level assign; Worker emits auto-submit HTML |
| `fallback` | `/api/v2/flow/fallback?flow=...` only | Top-level assign; Worker reconstructs native URL |
| `complete` | `/api/v2/flow/continue?flow=...` only | Top-level assign; Worker validates and redirects/posts |

The browser never accepts an absolute URL from JSON. Only the Worker performs external redirects or emits SAML/IDP POST forms, after validating the native destination.

### Endpoint inventory

| Method and endpoint | Domain contract |
| --- | --- |
| `GET /api/v2/bootstrap` | Return public default branding, languages, translations, and chooser availability; accept per-subject `updatedAt` |
| `POST /api/v2/flow/initialize` | Consume exactly one OIDC/SAML ingress request, validate client/scope/prompt, create encrypted flow, return canonical transition |
| `GET /api/v2/flow/resume?flow=` | Open/validate flow and return its canonical public projection |
| `GET /api/v2/flow/continue?flow=` | Complete OIDC/SAML or safe default redirect; clear flow after terminal response |
| `GET /api/v2/flow/fallback?flow=` | Delegate the untouched native request to Login V2; reject after a non-delegable mutation |
| `POST /api/v2/flow/cancel` | Create native access-denied/cancel response where protocol permits; otherwise clear and return restart state |
| `POST /api/v2/discovery/resolve` | Resolve identifier/org context and return allowed next method without exposing user existence |
| `GET /api/v2/session/accounts?flow=` | Validate encrypted account registry against native `ListSessions`; return safe account summaries |
| `POST /api/v2/session/continue` | Revalidate selected account and complete or request reauthentication |
| `POST /api/v2/session/delete` | Delete one native session and remove its encrypted registry entry |
| `POST /api/v2/session/delete-all` | Delete each known native session, tolerate stale entries, then clear registry |
| `POST /api/v2/email-otp/start` | Primary email lookup/eligibility, session create, email challenge |
| `POST /api/v2/email-otp/resend` | Re-challenge the current primary email OTP stage |
| `POST /api/v2/email-otp/verify` | Apply primary email OTP check and route through policy continuation |
| `POST /api/v2/password/verify` | Apply password check and route through expiry, verification, and MFA policy |
| `POST /api/v2/password/reset-request` | Start native reset-link delivery with a Worker ingress URL template |
| `POST /api/v2/password/set` | Set initial/reset password with native verification code consumed by Worker |
| `POST /api/v2/password/change` | Verify current session/password as required and set changed password |
| `POST /api/v2/webauthn/assertion/options` | Request native WebAuthn challenge and return public credential options |
| `POST /api/v2/webauthn/assertion/verify` | Validate assertion shape, apply native WebAuthn check, continue policy |
| `POST /api/v2/webauthn/registration/options` | Start passkey or U2F registration for the encrypted user/session |
| `POST /api/v2/webauthn/registration/verify` | Apply native registration verification and continue/check-after policy |
| `GET /api/v2/identity-provider/list?flow=` | Return public enabled-provider projections for current policy context |
| `POST /api/v2/identity-provider/start` | Start native intent and return Worker redirect/POST continuation only |
| `GET|POST /api/v2/identity-provider/callback/:provider` | Consume native intent result, validate flow/provider, link/create/complete, then scrub secrets via redirect |
| `POST /api/v2/identity-provider/ldap` | Start LDAP intent with ephemeral credentials and process its result |
| `POST /api/v2/identity-provider/link` | Confirm policy-permitted linking to the authenticated encrypted session |
| `POST /api/v2/identity-provider/complete-registration` | Validate missing profile/privacy fields, create/link user, continue |
| `GET /api/v2/mfa/options?flow=` | Return enrolled and policy-allowed factors plus setup/skip choices |
| `POST /api/v2/mfa/otp/challenge` | Challenge SMS or email OTP; TOTP has no delivery challenge |
| `POST /api/v2/mfa/otp/verify` | Apply TOTP/SMS/email check and continue |
| `POST /api/v2/mfa/otp/enroll` | Start TOTP/SMS/email enrollment and return safe setup model |
| `POST /api/v2/mfa/otp/enroll-verify` | Verify TOTP registration or check-after OTP and continue |
| `POST /api/v2/mfa/skip` | Record native MFA-init skip only when current policy permits it |
| `POST /api/v2/registration/create` | Create local human user with selected native primary method and privacy acceptance |
| `POST /api/v2/verification/resend` | Send/resend invite or email verification using Worker ingress template |
| `POST /api/v2/verification/verify` | Verify email or invite code held only in request memory/encrypted flow |
| `POST /api/v2/device/lookup` | Resolve `user_code`, create `device_` flow, and route to sign-in or consent |
| `POST /api/v2/device/decision` | Approve with encrypted native session or deny; terminal state |
| `POST /api/v2/logout/initialize` | Consume and validate logout token; return matching safe account summaries |
| `POST /api/v2/logout/confirm` | Delete selected/all sessions and continue to validated post-logout URI |

Endpoint request/response schemas live with their context and contain no generic arbitrary `action`, `payload`, route, or redirect fields. Each mutation is idempotent where native semantics allow it; duplicate terminal submissions return the canonical completed/restart state, not a repeated native mutation.

## Encrypted continuation and account state

### Flow cookie

Cookie name: `__Host-zitadel-login-flow-<flowHandle>`. Attributes: `Path=/; HttpOnly; Secure; SameSite=Lax`; use `SameSite=None` only when current native security settings explicitly allow iframe embedding, and retain `Secure`. Maximum three active flow cookies; evict only expired or terminal flows, never an active flow silently.

The Valibot variant contains:

- `version`, `stage`, random `flowHandle`, random CSRF token, `issuedAt`, `expiresAt`, and monotonic transition counter.
- Request kind and native request ID, validated client/application identity, prompt values, organization context, login hint provenance, and expected callback contract.
- At most one active native `sessionId`/`sessionToken`, user/organization IDs needed for policy, and pending challenge metadata.
- Pending IDP intent ID/token or WebAuthn challenge only while that stage is active.
- No password, submitted OTP, completed WebAuthn response, translated message, branding payload, or arbitrary redirect URL.

Seal with AES-256-GCM, a new 96-bit IV per write, schema/cookie-name/version as additional authenticated data, and a versioned key ring so the current key writes while the immediately previous key can read during rotation. Validate base64url, ciphertext length, schema, cookie/handle equality, timestamps, request/client binding, and allowed stage transition after decrypting. Clear on terminal completion, fallback, expiry, decryption failure, or explicit cancel.

### Account-session cookie

Cookie name: `__Host-zitadel-login-accounts`. It is independently encrypted and contains at most three native session references/tokens plus login name, organization, expiration/change timestamps, and display-safe cache fields. Enforce a pre-encryption size budget that remains below the 4096-byte cookie limit after base64url/GCM overhead. Evict expired entries first and then the oldest entry; never put session tokens in the flow URL or browser-readable storage.

Every account list/continue operation calls native `ListSessions`/`GetSession`; cookie metadata alone never establishes validity. Session token rotation updates the encrypted cookie atomically. A stale token removes only that entry. Completion validates the OIDC redirect against `GetAuthRequest.redirectUri`; SAML redirect/post destination against `GetSAMLRequest`; IDP destinations against the exact intent response; and logout redirect against the native logout contract.

## Branding, settings, and cache

The Worker resolves default organization, request organization/domain scope, branding, login settings, legal/support settings, allowed languages, hosted-login translations, password settings, and security settings through native APIs. Browser models include only fields needed to render.

Cache classes:

| Class | Worker policy | Browser policy |
| --- | --- | --- |
| Branding, legal links, allowed languages, hosted translations | Instance/org/locale key; 60-minute fresh TTL, stale-while-revalidate up to 24 hours | Validated last-known projection, 24-hour stale display |
| Public login/password settings projection | Instance/org key; maximum 5-minute fresh TTL | Display hint only; refresh each flow |
| Security settings | Instance key; maximum 5-minute fresh TTL | Never sent wholesale or persisted |
| Auth requests, users, methods, sessions, challenges, intents, callbacks | No cache | No cache |

Use Cloudflare Cache API or an explicit bounded Worker cache adapter, not module-global unbounded maps. Cache keys include ZITADEL origin/instance, organization, locale, projection schema version, and upstream update timestamp when available. Concurrent refreshes deduplicate. A native failure may serve stale branding but never stale authorization policy. Return subject-level `updatedAt`; a matching browser timestamp produces `null` for that subject.

Brand fallbacks are local and minimal: Contentoren text name, neutral accessible palette, no watermark, no remote font, and no invented legal URL. Validate logo/icon/font URLs as HTTPS URLs on the configured ZITADEL asset origin (or an explicit asset allowlist). Apply custom fonts with `font-display: swap` and retain a system fallback. Logo alternatives use the organization name; decorative marks are hidden from assistive technology.

## Theme behavior

Resolve theme before first paint with a small CSP-compatible bootstrap script or server-provided class to avoid a flash. Resolution order:

1. Upstream branding `LIGHT` or `DARK`: force that mode and disable user switching.
2. Upstream `AUTO` or `UNSPECIFIED`: valid stored `light`/`dark`/`system` preference.
3. Missing preference: `system` using `prefers-color-scheme`.

In `system`, subscribe to media-query changes and clean up the listener. Set `color-scheme`, document class/data attribute, theme-color metadata, branding CSS variables, and the matching light/dark logo together. Cross-tab preference changes update immediately. Both palettes must meet WCAG 2.2 AA and remain usable with forced colors, reduced motion, 200% zoom, and unavailable branding assets.

## Localization

Locale precedence is valid OIDC `ui_locales` (when configured to override), valid explicit user preference, valid language cookie/preference, `Accept-Language`, instance default, then English. Normalize supported regional tags to the available language while preserving a full valid tag if a hosted translation exists.

The v4.16 baseline bundles `ar`, `de`, `en`, `es`, `fr`, `hu`, `it`, `ja`, `nl`, `pl`, `pt`, `ru`, `tr`, `uk`, and `zh`; the layout's static `LANGS` omits `hu`, so native allowed-language intersection behavior must be captured by tests rather than copied blindly. Load the instance/org hosted-login translation overlay and fall back key-by-key to repository messages, then English. Never render a translation key or upstream HTML unsanitized.

Use `Intl` for display names and locale formatting. Set `lang` and `dir` on the document; Arabic is RTL. Preserve user-entered identifiers and codes in logical/LTR islands where needed. Locale changes keep the same canonical route and flow handle and do not repeat a mutation.

## Accessibility contract

- Meet WCAG 2.2 AA and use semantic landmarks, headings, labels, fieldsets/legends, lists, and native buttons/links.
- Every form has programmatic labels, correct `autocomplete` and `inputmode`, visible instructions, and errors connected with `aria-describedby`/`aria-invalid`.
- Move focus to the route heading after navigation and to an error summary after failed submission; preserve useful field focus on retry.
- Use polite status regions for challenge delivery/progress and an assertive alert only for actionable errors. `aria-busy` must not hide controls without an accessible status.
- WebAuthn and IDP cancellation return focus to the initiating method. Keyboard, screen reader, switch, touch, and pointer operation must all work.
- OTP paste is supported without forced per-character inputs. Do not block password managers or paste.
- Respect reduced motion, forced colors, high contrast, 320 CSS-pixel width, 200% zoom, and mobile safe areas.
- Avoid countdown-only instructions. Resend availability and expiry are conveyed textually and do not rely on color.
- SAML/IDP auto-submit pages include a visible, keyboard-operable `noscript`/manual continuation.

## Route parity matrix

`Fallback` means native Login V2 remains authoritative until the listed phase gate passes. Custom paths are canonical after ingress; upstream query payloads are represented in encrypted flow state, not copied into custom URLs.

| Upstream v4.16 route | Custom route | Behavior/API ownership | Phase |
| --- | --- | --- | --- |
| `/login?authRequest=` | `/login` ingress | Validate OIDC request, scopes, prompts, sessions, direct IDP/org hints; consume and scrub request ID | P0/P2 |
| `/login?samlRequest=` | `/login` ingress | Validate SAML request, sessions, and completion binding; consume and scrub request ID | P8 |
| `/` | `/login` | Chooser/default entry; upstream redirects to login name | P1 |
| `/loginname` | `/login/loginname` | Identifier/org discovery, anti-enumeration, method routing, registration availability | P3 |
| `/accounts` | `/login/accounts` | List/revalidate encrypted native sessions, select/re-authenticate/clear | P2 |
| `/password` | `/login/password` | Password check, reset entry, passkey alternative, continuation policy | P3 |
| `/password/change` | `/login/password/change` | Required/expired password change then continuation | P3 |
| `/password/set` | `/login/password/set` | Initial or reset-code password set, complexity policy | P7 |
| `/passkey` | `/login/passkey` | WebAuthn assertion, conditional/user verification, password alternative | P5 |
| `/passkey/set` | `/login/passkey/set` | Passkey registration link/code and attestation | P5/P7 |
| `/mfa` | `/login/mfa` | Choose among enrolled continuation factors | P4 |
| `/mfa/set` | `/login/mfa/set` | Choose allowed setup factor, forced/optional skip, check-after | P4 |
| `/authenticator/set` | `/login/authenticator/set` | Choose password or passkey as primary authenticator after invite/verification | P7 |
| `/otp/time-based` | `/login/otp/time-based` | TOTP session check | P4 |
| `/otp/email` | `/login/otp/email` | MFA email challenge/check; distinct from primary email OTP | P4 |
| `/otp/sms` | `/login/otp/sms` | MFA SMS challenge/check | P4 |
| `/otp/time-based/set` | `/login/otp/time-based/set` | TOTP secret/QR enrollment and verification | P4 |
| `/otp/email/set` | `/login/otp/email/set` | Native email OTP enrollment/check-after | P4 |
| `/otp/sms/set` | `/login/otp/sms/set` | Native SMS OTP enrollment/check-after | P4 |
| `/u2f` | `/login/u2f` | WebAuthn U2F assertion as second factor | P5 |
| `/u2f/set` | `/login/u2f/set` | U2F registration and optional check-after | P5 |
| `/idp` | `/login/idp` | List policy-active providers and start intent | P6 |
| `/idp/ldap` | `/login/idp/ldap` | LDAP username/password intent and continuation | P6 |
| `/idp/[provider]/process` | Worker callback, then canonical route | Retrieve intent; direct login, linking, auto-create, or incomplete registration | P6 |
| `/idp/[provider]/failure` | `/login/idp/:provider/failure` | Classified provider/native failure with safe retry | P6 |
| `/idp/[provider]/complete-registration` | `/login/idp/:provider/complete-registration` | Missing profile/privacy input, create/link, continue | P6 |
| `/idp/[provider]/registration-failed` | `/login/idp/:provider/registration-failed` | Safe registration failure/restart | P6 |
| `/idp/[provider]/linking-failed` | `/login/idp/:provider/linking-failed` | Session/link policy failure/restart | P6 |
| `/idp/[provider]/account-not-found` | `/login/idp/:provider/account-not-found` | No-link/no-create outcome | P6 |
| `/register` | `/login/register` | Local profile/privacy capture and primary-method choice | P7 |
| `/register/password` | `/login/register/password` | Registration with password and complexity policy | P7 |
| `/verify` | `/login/verify` ingress/canonical | Invite/email code verification and resend; consume link code | P7 |
| `/verify/success` | `/login/verify/success` | Verified confirmation and policy continuation | P7 |
| `/device` | `/login/device` ingress | User-code lookup and sign-in routing | P8 |
| `/device/consent` | `/login/device/consent` | Display client/scopes and approve or deny with session | P8 |
| `/signedin` | `/login/signedin` | Safe default completion when no live protocol request remains | P2 |
| `/logout` | `/login/logout` ingress | Validate logout token, select/clear sessions | P8 |
| `/logout/done` | `/login/logout/done` | Confirmation and validated post-logout continuation | P8 |
| `(login)/error.tsx`, `global-error.tsx` | `/login/error` plus app boundary | Classified recoverable/fatal rendering without detail leakage | P0, expanded each phase |
| `/healthy`, `/ready` | `/api/healthy`, `/api/ready` | Liveness and configuration/dependency readiness; no secrets | P0 |
| `/otel-test` | None in production | Development telemetry test is not product parity | Excluded |

No custom recovery-code route is added because none exists in the tagged Login V2 app. Native fallback remains the only recovery-code path.

## Native API parity matrix

The upstream names below are exact wrappers/RPC calls in `apps/login/src/lib/zitadel.ts` at `v4.16.0`. "Worker owner" names the proposed domain adapter/endpoint family, not permission to expose the native API directly.

| Native service method(s) | Upstream wrapper | Worker owner | Phase |
| --- | --- | --- | --- |
| Settings `GetHostedLoginTranslation` | `getHostedLoginTranslation` | `branding` bootstrap projection | P1 |
| Settings `GetBrandingSettings` | `getBrandingSettings` | `branding` bootstrap projection | P1 |
| Settings `GetLoginSettings` | `getLoginSettings` | `flow`, `discovery`, policy continuation; public projection only | P0 onward |
| Settings `GetSecuritySettings` | `getSecuritySettings` | `http` CSP/cookie embedding policy | P0 |
| Settings `GetLockoutSettings` | `getLockoutSettings` | `password` safe attempt messaging/policy | P3 |
| Settings `GetPasswordExpirySettings` | `getPasswordExpirySettings` | `password` change-required decision | P3 |
| Settings `GetGeneralSettings` | `getAllowedLanguages` | `localization` bootstrap | P1 |
| Settings `GetLegalAndSupportSettings` | `getLegalAndSupportSettings` | `branding` legal-link projection | P1/P7 |
| Settings `GetPasswordComplexitySettings` | `getPasswordComplexitySettings` | `password`, `registration` projection and server validation | P3/P7 |
| Settings `GetActiveIdentityProviders` | `getActiveIdentityProviders` | `identity-provider` list/start and discovery | P3/P6 |
| Organization `ListOrganizations` default query | `getDefaultOrg` | `branding`, `flow` default context | P0 |
| Organization `ListOrganizations` domain query | `getOrgsByDomain` | `flow`, `discovery` org-domain scope/discovery | P3 |
| User `ListUsers` | `listUsers`, `searchUsers` | `discovery`, primary email OTP eligibility | P1/P3 |
| User `GetUserByID` | `getUserByID` | policy continuation, registration/verification | P3 onward |
| User `ListAuthenticationMethodTypes` | `listAuthenticationMethodTypes` | discovery/MFA policy router | P1 onward |
| User `ListIDPLinks` | `listIDPLinks` | `identity-provider` user-specific routing/link checks | P6 |
| User `AddHumanUser` | `addHumanUser`, `addHuman` | `registration`, IDP auto-create | P6/P7 |
| User `UpdateHumanUser` | `updateHuman` | IDP incomplete-registration/profile completion | P6 |
| User `SendEmailCode` | `sendEmailCode` | `verification` initial delivery | P7 |
| User `ResendEmailCode` | `resendEmailCode` | `verification` resend | P7 |
| User `VerifyEmail` | `verifyEmail` | `verification` code check | P7 |
| User `CreateInviteCode` | `createInviteCode` | `verification` invite delivery | P7 |
| User `VerifyInviteCode` | `verifyInviteCode` | `verification` invite check | P7 |
| User `PasswordReset` | `passwordReset` | `password` reset request | P3/P7 |
| User `SetPassword` | `setUserPassword`, `setPassword` | `password` set/change/registration | P3/P7 |
| User `AddOTPEmail` | `addOTPEmail` | `mfa` email enrollment | P4 |
| User `AddOTPSMS` | `addOTPSMS` | `mfa` SMS enrollment | P4 |
| User `RegisterTOTP` | `registerTOTP` | `mfa` TOTP setup model | P4 |
| User `VerifyTOTPRegistration` | `verifyTOTPRegistration` | `mfa` TOTP setup verification | P4 |
| User `HumanMFAInitSkipped` | `humanMFAInitSkipped` | `mfa` policy-permitted skip | P4 |
| User `CreatePasskeyRegistrationLink` | `createPasskeyRegistrationLink` | `webauthn` passkey enrollment link/code | P5/P7 |
| User `RegisterPasskey` | `registerPasskey` | `webauthn` passkey registration options | P5 |
| User `VerifyPasskeyRegistration` | `verifyPasskeyRegistration` | `webauthn` passkey attestation verify | P5 |
| User `RegisterU2F` | `registerU2F` | `webauthn` U2F registration options | P5 |
| User `VerifyU2FRegistration` | `verifyU2FRegistration` | `webauthn` U2F attestation verify | P5 |
| User `StartIdentityProviderIntent` URL/form | `startIdentityProviderFlow` | `identity-provider` start/redirect/POST | P6 |
| User `StartIdentityProviderIntent` LDAP | `startLDAPIdentityProviderFlow` | `identity-provider` LDAP submit | P6 |
| User `RetrieveIdentityProviderIntent` | `retrieveIDPIntent` | Worker-only provider callback | P6 |
| User `AddIDPLink` | `addIDPLink` | `identity-provider` validated linking | P6 |
| IDP `GetIDPByID` | `getIDPByID` | `identity-provider` linked-provider type/slug resolution | P6 |
| Session `CreateSession` | `createSessionFromChecksAndChallenges`, `createSessionForUserIdAndIdpIntent` | primary methods, IDP, registration | P1 onward |
| Session `SetSession` | `setSession` | password, WebAuthn, OTP, challenge rotation | P1 onward |
| Session `GetSession` | `getSession` | every post-check policy transition and registry refresh | P1 onward |
| Session `ListSessions` | `listSessions` | request initiation/accounts/logout | P2 |
| Session `DeleteSession` | `deleteSession` | account clear/logout | P2/P8 |
| OIDC `GetAuthRequest` | `getAuthRequest` | OIDC flow initialization/revalidation | P0 |
| OIDC `CreateCallback` session/error | `createCallback` | OIDC complete, prompt none/cancel | P0/P2 |
| OIDC `GetDeviceAuthorizationRequest` | `getDeviceAuthorizationRequest` | `device-authorization` lookup | P8 |
| OIDC `AuthorizeOrDenyDeviceAuthorization` | `authorizeOrDenyDeviceAuthorization` | `device-authorization` decision | P8 |
| SAML `GetSAMLRequest` | `getSAMLRequest` | SAML initialization/revalidation | P8 |
| SAML `CreateResponse` redirect/post | `createResponse` | SAML completion | P8 |

### Current API preservation

The deployed v1 slice remains intact while v2 is built:

| Current Worker endpoint | Current native REST call(s) |
| --- | --- |
| `GET /api/auth-request` | `GET /v2/oidc/auth_requests/{id}` |
| `POST /api/email-otp/start` | `POST /v2/users`, `GET /v2/users/{id}/authentication_methods`, `POST /v2/sessions`, `PATCH /v2/sessions/{id}` OTP-email challenge |
| `POST /api/email-otp/resend` | `PATCH /v2/sessions/{id}` OTP-email challenge |
| `POST /api/email-otp/verify` | `PATCH /v2/sessions/{id}` OTP-email check |
| `GET|POST /api/email-otp/callback` | `POST /v2/oidc/auth_requests/{id}` session callback |
| `GET /api/prompt-none` | `POST /v2/oidc/auth_requests/{id}` login-required error callback |
| `GET /api/fallback` | Revalidate auth request, then redirect to `/ui/v2/login?authRequest={id}` |

The current implementation covers OIDC and primary email OTP only. It uses one `__Host-zitadel-login-flow` AES-GCM cookie and hardcodes one allowed organization; v2 generalizes these contracts without weakening callback, origin, CSRF, rate-limit, or no-store controls.

## Test layers

| Layer | Scope | Required evidence |
| --- | --- | --- |
| Schema/unit | Every URL, storage, cookie, Worker body/response, native projection, Result mapper, error classifier | Valid, boundary, malformed, duplicate, oversized, expired, wrong-stage, and redaction cases |
| Pure domain/state-machine | Every flow transition and ownership gate | Table tests for prompts, org scopes, method combinations, policy branches, retries, replay, fallback-before-mutation |
| Native adapter contract | Recorded/generated v4.16-compatible fixtures and mocked fetch | Exact method/path, request body, auth header isolation, non-OK parsing, unknown enum/field tolerance |
| Worker integration | Hono app with fake native services, crypto, clock, and rate limiter | Cookie attributes/rotation, CSRF/origin, cache headers, callback validation, redirect/POST safety, v1 coexistence |
| Solid component | DOM tests around state factories and views | Labels, errors, focus, busy/status behavior, URL canonicalization, storage failure, theme/locale changes |
| Browser E2E | Chromium, Firefox, WebKit; desktop/mobile | Each enabled route/method success, cancellation, invalid credential/code, resend, back/reload, multiple tabs, fallback |
| Accessibility | Automated axe plus manual keyboard/screen-reader/high-contrast/zoom checks | No serious/critical violations and route-specific checklist completion |
| Security regression | Adversarial Worker/browser cases | Open redirect, callback mismatch, CSRF, replay, fixation, cookie tamper/overflow, user enumeration, XSS translations/branding, IDP mix-up, WebAuthn origin/RP mismatch, log redaction |
| Upstream parity | Port behavior assertions from tagged unit and acceptance tests | Mapping from each supported upstream test to custom equivalent or documented non-applicable reason |
| Live smoke | Dedicated test client/users only after deployment task approval | Native email/IDP/WebAuthn/session callback and fallback; never part of Task 2 |

Tests must not depend on `allgroups-chat` authentication or mutate ZITADEL source. A phase cannot be enabled based only on unit tests.

## Migration and fallback gates

Evaluation order is fail-closed and server-side:

1. Global kill switch and Worker readiness.
2. Allowed instance, client/application, protocol, and organization scope.
3. Route/capability version gate.
4. Upstream public policy and provider/method availability.
5. Complete remaining-flow ownership for the discovered user/policy branch.
6. Valid encrypted stage, CSRF/origin, and rate-limit decision.

Gate keys are configuration, not browser flags: global, client ID, protocol, capability, provider ID, and optional organization. The Worker includes a non-sensitive gate reason in structured telemetry but never in the browser URL.

Fallback is allowed only while the native request remains valid and before a non-delegable mutation such as creating/checking a session, starting an IDP intent with custom callbacks, sending a replacement verification code, or approving a device request. After ownership begins, failures render retry/cancel/restart behavior in the custom flow; they do not silently switch UIs. An unsupported branch discovered during preflight delegates immediately. An unsupported branch discovered after mutation is a release-gate defect.

Native fallback URL construction remains Worker-only and uses the original validated `authRequest`/`samlRequest` contract. Do not place a fallback URL from configuration directly in browser JSON. Global rollback routes new untouched requests to native Login V2; it does not invalidate already active encrypted flows.

Cutover requires a soak window per client/capability, telemetry showing no unknown transitions, and successful fallback drills. Remove fallback only after all in-scope routes and tests pass; recovery codes retain native access until separately implemented.

## Phased vertical parity matrix

Each phase is independently deployable because its gates default off and existing/native paths remain available.

### P0: Contracts, flow kernel, and safe shell

Scope: module boundaries, v2 Result envelope, schemas, encrypted per-flow/key-ring state, URL canonicalization, OIDC initialize/resume/complete/error, health/readiness, security headers, bootstrap projection skeleton, and fallback gates. No new credential method is enabled.

Acceptance criteria:

- Current v1 email OTP behavior and tests remain unchanged.
- A v2 OIDC request is validated against allowed client/org/scope and scrubbed to `/login?flow=...`.
- `PROMPT_NONE` returns a native login-required callback when no valid session; no UI is rendered.
- Cookie tamper, wrong handle, expiry, replay, oversize, and previous-key rotation tests pass.
- Absolute/browser-supplied redirects are impossible; callbacks are matched to the native request.
- Global/client/capability fallback occurs before mutation and is integration-tested.
- Type-check, format check, unit tests, Worker integration tests, and browser shell smoke pass.

### P1: Branding, theme, localization, chooser, and primary email OTP

Scope: dynamic Contentoren branding/legal links, cache contract, light/dark/system behavior, language negotiation, method chooser, safe preferences, URL-addressable `/login/email-otp`, and migration of the existing email-OTP vertical to `/api/v2`.

Acceptance criteria:

- Light/dark logo, icon, palette, custom-font fallback, no-watermark behavior, and missing/invalid asset fallback render without layout shift or unsafe URL.
- Forced branding theme and switchable AUTO/UNSPECIFIED semantics work before paint and across tabs.
- Stored theme/locale/method/remembered identifier are schema-validated; storage denial/corruption does not block sign-in.
- OTP start/resend/invalid/expired/success/rate-limit/fallback cases preserve anti-enumeration and native ownership.
- Passwords, OTPs, identifiers without opt-in, request IDs, and session tokens never enter storage or logs.
- English, German, RTL, unsupported locale fallback, and hosted translation overlay tests pass.
- Axe, keyboard, focus, 320px, 200% zoom, reduced-motion, and forced-color checks pass for chooser and OTP.

### P2: Existing sessions, prompts, accounts, and OIDC completion

Scope: encrypted bounded account registry, session list/refresh/select/delete, `/login/accounts`, `/login/signedin`, default prompt behavior, `LOGIN`, `SELECT_ACCOUNT`, `CREATE`, and safe callback completion.

Acceptance criteria:

- Valid eligible session completes directly when prompt permits; stale/expired/wrong-org entries are removed.
- `SELECT_ACCOUNT` always shows eligible accounts; no eligible account routes to discovery.
- `LOGIN` requires reauthentication; `CREATE` delegates until P7.
- Account selection, one/all clear, multiple tabs, cookie budget/eviction, token rotation, and reload pass.
- OIDC callback URL query/path/origin matching rejects additions, duplicates, credentials, or mismatches.
- Capability can be disabled per client with untouched requests falling back natively.

### P3: Login discovery and password vertical

Scope: login-name/email/phone rules, org suffix/domain discovery, user-enumeration policy, primary-method routing, password verification/reset request, required/expired change, and completion for users whose remaining branches are owned.

Acceptance criteria:

- Exact/ignore-case behavior follows native login settings and org scope; zero/multiple/inactive users do not leak identity when enumeration protection is enabled.
- Method routing honors local-auth, passkey, IDP, registration, and unknown-username settings.
- Password is never logged, cached, retained after submission, or returned; native failed-attempt classification maps safely.
- Reset delivery uses a Worker ingress template and never exposes the native code after consumption.
- Complexity, lockout, expiry, change-required, current-password, invalid reset code, and success cases pass.
- Users requiring an unowned MFA/verification/setup branch are delegated during preflight before password/session mutation.

### P4: MFA OTP selection and setup

Scope: `/login/mfa`, `/login/mfa/set`, TOTP/SMS/email OTP check and enrollment, forced/optional setup, skip lifetime, challenge resend, and check-after continuation.

Acceptance criteria:

- Available choices are the intersection of native policy, enrollment, verified email/phone, and capability gates.
- A single factor routes directly; multiple factors show selection; passkey user verification correctly satisfies MFA where native does.
- TOTP secret/QR, SMS/email challenge state, OTP values, and session tokens exist only in memory/encrypted flow and are cleared on transition.
- Forced setup cannot skip; optional skip calls native `HumanMFAInitSkipped` exactly once and respects lifetime.
- Invalid/expired/replayed code, resend, delivery failure, check-after, refresh/back, and rate-limit cases pass for each method.

### P5: Passkeys and U2F

Scope: primary passkey assertion/registration, password alternative, U2F assertion/setup, RP/origin validation, user-verification semantics, cancellation, and policy continuation.

Acceptance criteria:

- Native challenge is bound to flow, expected RP ID/origin, user/session, ceremony type, and one transition counter.
- Challenge and credential data are validated with bounded schemas and never persisted or logged.
- Success, no credential, cancellation, timeout, malformed authenticator data, wrong origin/RP, replay, and unsupported browser pass safely.
- Password alternative is shown only when policy and enrollment permit it.
- U2F setup/check-after and passkey registration-link/code routes complete end to end.
- Chromium, Firefox, WebKit behavior is covered where virtual authenticators permit; real-device smoke remains a deployment task.

### P6: External identity providers and linking

Scope: provider list/start, Google/GitHub priority, generic OIDC/OAuth/SAML/JWT providers, Apple/Microsoft/GitLab variants, LDAP, callback retrieval, direct login, auto-link, explicit link, auto-create, incomplete registration, and every classified failure route.

Acceptance criteria:

- Provider start binds provider ID/type, flow, organization, callback path, and linking intent before redirect/POST.
- Callback rejects missing/mismatched provider, intent, flow, organization, link session, or fingerprint and cannot mix flows.
- GET redirect and HTML form-post providers work with safe destinations and manual continuation fallback.
- Existing link, auto-link by email/username, linking forbidden, account absent, auto-create, creation forbidden, incomplete profile/privacy, registration failure, and retry branches pass.
- Provider-specific gate remains off until all callback outcomes for that provider are owned; no post-intent native fallback.
- Upstream IDP acceptance scenarios have mapped custom E2E tests.

### P7: Registration, invitation, email verification, and credential setup

Scope: local registration with password/passkey choice, privacy acceptance, invite verification, email verification/resend/success, authenticator selection, initial password, and passkey setup.

Acceptance criteria:

- Registration availability and required fields come from current organization policy; server repeats all validation.
- Privacy terms are linked from validated native legal settings and explicit required acceptance is recorded only in the submitted request.
- Invite/email links enter through Worker, consume/scrub code/request context, and resist replay.
- Resend invalidates/replaces codes only with explicit user action; reload does not send automatically.
- Password and passkey registration branches both reach a valid native session and protocol completion.
- Existing/duplicate user, invalid/expired code, unverified email, no primary method, initial user, and setup cancellation pass without enumeration leaks.
- `PROMPT_CREATE` is enabled only after this whole phase passes.

### P8: SAML, device authorization, and logout

Scope: SAML request/session flow and redirect/form-post completion, device user-code/login/consent/approve/deny, and logout token/session/post-logout behavior.

Acceptance criteria:

- SAML request IDs are scrubbed, revalidated at completion, and cannot be handled by OIDC paths.
- Redirect and POST bindings validate destination; POST HTML escapes every field, has strict CSP, and includes manual continuation.
- Device code unknown/expired/pending, sign-in, consent details, approve, deny, replay, and terminal states pass.
- Consent names the requesting client and scopes accessibly and never approves without an encrypted valid session.
- Logout token and post-logout destination are consumed/validated by Worker; one/all session deletion tolerates stale entries.
- Protocol/capability fallback happens before mutation and can be disabled independently.

### P9: Full parity hardening and cutover readiness

Scope: complete upstream test mapping, classified errors, observability/redaction, all browsers/accessibility/security, chaos/degraded dependencies, soak gates, and rollback drills. This phase prepares but does not deploy or mutate live configuration.

Acceptance criteria:

- Every route and native API row is implemented, explicitly excluded, or deliberately kept on native fallback with owner/reason.
- Every applicable tagged upstream unit/acceptance scenario has a passing mapped test.
- No unknown transition, unclassified upstream error, secret-bearing log, unsafe cache, or serious/critical accessibility finding remains.
- Branding/settings outage serves only safe stale presentation; policy/session/API outage fails closed with retry or untouched fallback.
- Per-client capability enable/disable, global rollback, key rotation, fallback drill, and active-flow behavior are documented and tested.
- Recovery codes remain explicitly native fallback; adding them requires a separate source/API investigation and phase.

## Known blockers and follow-ups

- The local ZITADEL working tree is newer than v4.16.0. The tag is available and was used directly, but implementation must continue to pin fixtures and behavior to `02d07e9` until the deployed version changes.
- The v4.16 app uses generated Connect clients; current project code uses selected JSON REST `/v2` endpoints. Before each new adapter is implemented, verify the deployed HTTP annotation/path and permission with local v4.16 proto/OpenAPI artifacts and a non-mutating contract test. Do not infer a REST path from a TypeScript wrapper name.
- Full parity needs API permissions beyond the current email-OTP PAT operations, especially Settings, IDP, SAML, device authorization, registration, linking, and logout. Required permissions must be inventoried before enabling each phase; Task 2 performs no live check or mutation.
- Recovery codes are configured in Contentoren but absent from the tagged Login V2 application. They cannot be claimed as v4.16 custom parity without a separate native API and UX decision.
- Iframe support changes cookie `SameSite` and CSP behavior. Keep it disabled unless native security settings explicitly enable it and cross-browser E2E passes.
- Browser bootstrap caching requires a stable upstream update marker or a Worker-generated projection timestamp. Choose the marker while implementing P1 and contract-test `null` unchanged responses.

## Source verification index

- Routes: `apps/login/src/app/(login)/**/page.tsx` and `apps/login/src/app/login/route.ts` at tag `v4.16.0`.
- Flow semantics: `apps/login/src/lib/server/flow-initiation.ts`, `auth-flow.ts`, `loginname.ts`, `session.ts`, `password.ts`, `passkeys.ts`, `verify.ts`, `idp.ts`, `idp-intent.ts`, `register.ts`, `u2f.ts`, `device.ts`.
- Native API wrappers: `apps/login/src/lib/zitadel.ts` and service construction in `apps/login/src/lib/service.ts`.
- OIDC/SAML completion: `apps/login/src/lib/oidc.ts` and `apps/login/src/lib/saml.ts`.
- Theme/branding/localization: `apps/login/src/components/theme-wrapper.tsx`, `dynamic-theme.tsx`, `language-provider.tsx`, `(login)/layout.tsx`, `apps/login/src/lib/theme.ts`, and `i18n.ts`.
- Upstream tests: `apps/login/acceptance/tests` and colocated `*.test.ts(x)` at tag `v4.16.0`.
- Current endpoints/native paths: `src/worker/workerAppCreate.ts`, `src/zitadel/zitadelClientCreate.ts`, and `test` in this repository.
- Current encrypted state: `src/flow/flowCookieSchema.ts`, `flowCookieSeal.ts`, and `flowCookieOpen.ts`.
- SolidJS reference patterns: the non-authentication `allgroups-chat` files listed in Status and scope.
