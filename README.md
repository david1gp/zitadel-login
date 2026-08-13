# @adaptive-ds/zitadel-login

A native [ZITADEL](https://zitadel.com/) Login App for people who should not have to remember another password — and for the methods they already use.

ZITADEL stays the identity system, session authority, OTP generator, email sender, and verifier. This project is the focused browser flow and the secure OIDC handoff: a static SolidJS page on Cloudflare Pages and a Hono Worker with no application database.

This repository is a deployable application, not a general-purpose authentication library. Native Login V2 remains the fallback for anything the custom app does not fully own.

Quick Links

- demo - https://zitadel-login.pages.dev/demo
- code - https://github.com/david1gp/zitadel-login
- npm - https://www.npmjs.com/package/@adaptive-ds/zitadel-login
- zitadel - https://zitadel.com/

## Why this exists

- **Native by design.** Uses ZITADEL v2 Auth Request, User, Session, WebAuthn, IdP, and OIDC callback APIs instead of a parallel identity store.
- **Familiar methods.** Email OTP, username/password, passkeys, and organization-enabled Google/GitHub, plus MFA continuation.
- **Simple for users.** Pick a method, complete the challenge, and return to the application.
- **Safe fallback.** Unknown, unenrolled, or unfinished capabilities continue through native Login V2 without consuming the authorization request.
- **Small operational footprint.** Static Pages + a Worker. No application database.
- **Conservative security model.** Sensitive orchestration stays in encrypted, short-lived, host-only cookies. The ZITADEL machine credential never reaches the browser.

## Architecture

```text
OIDC client
   -> ZITADEL Auth Request
   -> Cloudflare Pages /login (SolidJS)
   -> Cloudflare Worker (Hono)
   -> ZITADEL v2 Session + native challenges
   -> ZITADEL callback
   -> original OIDC redirect URI
```

The Pages app reads the non-secret `globalThis.ZITADEL_LOGIN_CONFIG.apiOrigin` value from `client/public/config.js`. An empty value uses the current page origin. The Worker keeps the authorization request, session tokens, and continuation state inside encrypted flow cookies, then performs the final top-level redirect itself.

Canonical routes include `/login`, `/login/email-otp`, `/login/password`, `/login/passkey`, `/login/idp/:provider`, `/login/mfa`, `/password/forgot`, and `/password/reset`.

## What it covers

Implemented in the custom app today:

- Primary email OTP, password, and passkey sign-in
- Google and GitHub when the organization enables them
- Recent-account selection from an encrypted cookie
- MFA selection, optional skip when policy allows, and checks for TOTP, email OTP, enrolled SMS OTP, U2F, and passkeys
- Enrollment for TOTP, U2F, passkeys, and email OTP
- Required password change and standalone password recovery (recovery is off unless you enable it)

Still on native Login V2, or not finished here:

- Registration, email verification, external-user linking, and organization selection
- Recovery-code checks
- New SMS enrollment (already-enrolled SMS factors still work)
- Anything the Worker cannot complete safely before mutating the authorization request

## Eligibility and enrollment

Email OTP is a primary passwordless option, not a second-factor screen. That path is eligible only when the request resolves to exactly one active human user in the configured organization whose email is verified, matches the submitted address, matches any ZITADEL login hint, and has `AUTHENTICATION_METHOD_TYPE_OTP_EMAIL` enrolled.

Anonymous first-use enrollment is intentionally not supported: ZITADEL does not provide a trusted anonymous email-OTP enrollment path. The current bootstrap policy is to pre-enroll every active, verified-email human user, **including administrators for now**. Service users are excluded. Later users should be enrolled during trusted provisioning or after authenticating with a password, passkey, or identity provider.

Enrollment itself sends no email. It only adds the native OTP Email method. Sign-in then asks ZITADEL to generate, deliver, expire, throttle, and verify each code.

## Fallback behavior

The Worker redirects to Login V2 without consuming the authorization request when a user is unknown, ambiguous, inactive, unverified, outside the organization, unenrolled, or otherwise cannot complete the owned flow. Account creation and account-selection prompts that the custom app does not own use the same fallback. A `PROMPT_NONE` request never starts an interactive flow; it completes through the ZITADEL callback with `login_required`.

The fallback URL must use the configured ZITADEL origin and normally points to `/ui/v2/login`. The browser receives only relative continuation paths. Callback URLs and authorization state stay Worker-controlled.

## Security model

- `ZITADEL_LOGIN_CLIENT_PAT` is an encrypted Cloudflare Worker secret. It is never sent to or bundled for the browser.
- `FLOW_COOKIE_KEY` protects a `__Host-` cookie with AES-GCM. The cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, host-only, and expires with the configured flow lifetime.
- Recent-account and password-recovery cookies are separate encrypted host-only cookies when those features are enabled.
- CSRF tokens, strict origin checks, validated OIDC client and organization scopes, and safe callback-URL validation protect the browser-to-Worker handoff.
- Cloudflare Rate Limit is mandatory. Rate-limit keys are HMAC-derived and opaque; raw email addresses are never used as identifiers.
- Responses are `no-store` and include restrictive browser security headers. The Worker returns safe error messages rather than ZITADEL response bodies.
- No password, OTP, session token, callback URL, or raw email is persisted by this project outside short-lived encrypted cookies and ZITADEL itself.

This is not a substitute for a security review, correct ZITADEL permissions, TLS, SMTP security, or Cloudflare account hardening.

## Configuration

Copy [`wrangler.example.jsonc`](./wrangler.example.jsonc) to `wrangler.jsonc` and keep the local file uncommitted. Use [`.dev.vars.example`](./.dev.vars.example) as the local Worker secret/value reference. `.env.example` is a generic reference; Wrangler local development reads `.dev.vars`.

| Binding | Secret | Required value |
| --- | --- | --- |
| `ZITADEL_ORIGIN` | No | HTTPS ZITADEL origin, without a path. `http://localhost` is allowed for local development. |
| `ZITADEL_ORGANIZATION_ID` | No | Organization containing the Login App and eligible users. |
| `ZITADEL_ALLOWED_CLIENT_IDS` | No | Comma-separated allowlist of OIDC client IDs. |
| `LOGIN_V2_FALLBACK_URL` | No | ZITADEL Login V2 URL on the same origin as `ZITADEL_ORIGIN`, normally `/ui/v2/login`. |
| `PAGES_ORIGIN` | No | Exact HTTPS Pages origin allowed to call the Worker. `http://localhost` is allowed locally. |
| `SESSION_LIFETIME_SECONDS` | No | Flow/session lifetime from `60` through `1800` seconds; the example uses `900`. |
| `ZITADEL_CUSTOM_LOGIN_ENABLED` | No | Strict `true`/`false` emergency switch for the custom Login App; defaults to `false`. |
| `ZITADEL_PASSWORD_RESET_V2_ENABLED` | No | Strict `true`/`false` switch for standalone password recovery; defaults to `false`. |
| `ZITADEL_LOGIN_CLIENT_PAT` | Yes | ZITADEL machine-user PAT with the permissions required by the listed v2 APIs. Set as a Worker secret. |
| `FLOW_COOKIE_KEY` | Yes | 32 random bytes as unpadded base64url, exactly 43 characters. Set as a Worker secret. |
| `RECENT_ACCOUNT_COOKIE_KEY` | Optional | Same key format as `FLOW_COOKIE_KEY`. Set this to remember recent accounts. |
| `RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY` | Optional | Previous recent-account key, used only for rotation. |
| `RATE_LIMITER` | No | Cloudflare Rate Limit binding named `RATE_LIMITER`; the example uses a five-request, 60-second window. |

Generate a cookie key without putting it in shell history:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Set deployed secrets interactively so they do not appear in command arguments:

```bash
bunx wrangler secret put ZITADEL_LOGIN_CLIENT_PAT --config wrangler.jsonc
bunx wrangler secret put FLOW_COOKIE_KEY --config wrangler.jsonc
```

## Local development

Requirements: Bun 1.3+, Node.js 22+ for the current Wrangler toolchain, a ZITADEL development organization, and a test machine credential. Do not use production credentials in local files.

```bash
bun install
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
```

Replace the placeholders in `.dev.vars` and add local-only secret values. The Vite dev server proxies `/api` to the local Worker, so run both processes:

```bash
bun run dev:worker  # http://localhost:8787
bun run dev         # http://localhost:5173
```

For a separately deployed Worker, set its HTTPS origin in `client/public/config.js` as `apiOrigin` before building the Pages application. The empty default is correct only when the Worker is reachable at the same origin as the page.

## Testing and builds

```bash
bun run format:check
bun run type-check
bun run test
bun run build
```

Tests use mocked ZITADEL responses and cover the browser/Worker contract, encrypted state rotation, callbacks, fallback, origin checks, malformed state, safe errors, and opaque rate-limit keys. They do not contact a live ZITADEL instance.

## Cloudflare deployment

The deploy script builds both artifacts, deploys the Worker from `wrangler.jsonc`, and uploads `dist/client` to the Pages project. It does not create projects, configure domains, or set secrets.

```bash
bunx wrangler login
cp wrangler.example.jsonc wrangler.jsonc
# Edit wrangler.jsonc and set the two required secrets first.
bun run deploy
```

Use `PAGES_PROJECT_NAME` to select a different Pages project and `WRANGLER_CONFIG` to select a different local Worker config:

```bash
PAGES_PROJECT_NAME=my-login WRANGLER_CONFIG=wrangler.jsonc bun run deploy
```

Before the build, set `client/public/config.js` to the deployed Worker origin when Pages and Worker use different origins. Keep `PAGES_ORIGIN` equal to the public Pages URL. A same-origin custom-domain setup can leave `apiOrigin` empty.

## ZITADEL setup

The following assumes the deployed ZITADEL/Login V2 API version is v4.16.0.

1. Create or select the organization and OIDC Login App. Record its client ID and put it in `ZITADEL_ALLOWED_CLIENT_IDS`.
2. Point the application Login V2 base URI at the Pages `/login` route. Keep the original OIDC redirect URIs on the client application.
3. Keep Login V2 enabled at `/ui/v2/login`. It is the fallback and rollback path.
4. Create a least-privileged machine user/PAT for the Worker. It must read the allowed Auth Request and user/authentication-method state, create and update v2 Sessions, and complete or reject the OIDC Auth Request. Store the PAT only as `ZITADEL_LOGIN_CLIENT_PAT`.
5. Pre-enroll the current eligible population with native OTP Email, including administrators under the current policy. Do not enroll service users. Confirm active state and verified email before each administrative enrollment.
6. Configure SMTP in ZITADEL and set the native `VerifyEmailOTP` message fields. Start from [`ops/zitadel/message-texts/VerifyEmailOTP.v1.en.json`](./ops/zitadel/message-texts/VerifyEmailOTP.v1.en.json) and the German variant. Keep the `{{.OTP}}` placeholder. These files provide message fields only; ZITADEL keeps its native HTML shell and SMTP delivery.
7. First live-test with an enrolled, non-privileged user. Confirm unknown and unenrolled users reach Login V2 and that `PROMPT_NONE` returns `login_required`.

The committed message artifacts prefer the existing `auth@contentoren.de` sender where available, with `it@contentoren.de` as the fallback from the original project setup. Sender identity and SMTP credentials are configured in ZITADEL, not this repository.

The project-owned bootstrap command validates the exact organization ID/name pair and active SMTP sender, reconciles both committed message-text artifacts, and paginates all active human users in that organization before adding native OTP Email only to verified-email users that do not already have it. It excludes machine users at the ZITADEL query, includes administrators, emits aggregate/redacted JSON only, and defaults to dry-run. Provide `ZITADEL_ORIGIN`, `ZITADEL_ORGANIZATION_ID`, `ZITADEL_ORGANIZATION_NAME`, `ZITADEL_ADMIN_PAT`, and an exact eligible canary address as `ZITADEL_OTP_CONFIRM_EMAIL` through a private environment source:

```bash
bun run ops:zitadel:otp-email
ZITADEL_OTP_MODE=apply bun run ops:zitadel:otp-email
```

`ops:zitadel:test-client` validates the Login V2 routing prerequisite and reconciles the dedicated public Authorization Code + S256 PKCE test client. It also defaults to dry-run; use `ZITADEL_E2E_MODE=apply` only through a private environment source when creating the absent project or client. It does not run authorization or mailbox tests.

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start Vite/SolidJS browser development. |
| `bun run dev:browser` | Start Vite directly. |
| `bun run dev:worker` | Start Wrangler Worker development using `wrangler.jsonc`. |
| `bun run build` | Build the Pages browser bundle and type-check the Worker. |
| `bun run build:browser` | Build `dist/client`. |
| `bun run build:worker` | Type-check the Worker project. |
| `bun run type-check` | Type-check browser and Worker projects. |
| `bun run test` | Run Bun tests. |
| `bun run format` / `bun run format:check` | Format or check source and project metadata. |
| `bun run ops:zitadel:otp-email` | Dry-run native OTP Email message/enrollment reconciliation; `ZITADEL_OTP_MODE=apply` permits changes. |
| `bun run ops:zitadel:test-client` | Dry-run dedicated public OIDC test-client reconciliation; `ZITADEL_E2E_MODE=apply` permits changes. |
| `bun run deploy` | Build and deploy Worker plus Pages; requires local Wrangler config and Cloudflare auth. |
| `bun run release` | Generate a changelog, version, commit, tag, push, and GitHub release. Requires `git-cliff`, `jq`, `gh`, and authenticated Git/GitHub access. |

`release` is intentionally a mutation script. Review its output and run it only from a clean, correctly configured repository; it is not part of local verification.

## Limitations

- Email OTP only works for users already enrolled with native ZITADEL OTP Email.
- There is no anonymous enrollment or independent identity database here.
- Eligibility currently targets one configured ZITADEL organization and exact, verified email matches. Administrators are included in the initial pre-enrollment policy.
- Registration, email verification, account linking, organization selection, and recovery-code checks are not owned by the custom app yet.
- Email delivery and message rendering are controlled by ZITADEL and its SMTP configuration. The supplied artifacts cannot replace ZITADEL's complete email HTML template.
- A Cloudflare Rate Limit binding and encrypted Worker secrets are required for a meaningful deployment.
- The browser is a static SPA and the Worker is a separate origin unless routing or a custom domain makes them same-origin.
- Automated tests are mocked contract tests. Live ZITADEL enrollment, deployment, SMTP delivery, and end-to-end OIDC verification remain environment-specific.
- This project has not been independently audited.

## License

MIT © [David Siewert](https://david-siewert.com/)
