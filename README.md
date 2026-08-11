# @adaptive-ds/zitadel-login

[![npm version](https://img.shields.io/npm/v/%40adaptive-ds%2Fzitadel-login?logo=npm&label=npm)](https://www.npmjs.com/package/@adaptive-ds/zitadel-login)
[![Publish](https://github.com/david1gp/zitadel-login/actions/workflows/publish.yml/badge.svg)](https://github.com/david1gp/zitadel-login/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Passwordless email-OTP sign-in for [ZITADEL](https://zitadel.com/), built for people who should not have to remember another password. It is a native ZITADEL Login App: ZITADEL remains the identity system, session authority, OTP generator, email sender, and verifier while this project supplies the focused browser flow and secure OIDC handoff.

This repository is a deployable application bundle, not a general-purpose authentication library.

## Why This Exists

- **Native by design:** uses ZITADEL v2 Auth Request, User, Authentication Method, Session, and OIDC callback APIs instead of maintaining a parallel identity store.
- **Simple for users:** enter an email address, receive a verification code, and return to the application.
- **Safe fallback:** users who are not eligible for email OTP continue through the existing ZITADEL Login V2 flow.
- **Small operational footprint:** a static SolidJS/Vite page on Cloudflare Pages and a Hono Worker with no application database.
- **Conservative security model:** sensitive orchestration state is encrypted, short-lived, host-only cookie state; the ZITADEL machine credential never reaches the browser.

## Architecture

```text
OIDC client
   -> ZITADEL Auth Request
   -> Cloudflare Pages /login (SolidJS)
   -> Cloudflare Worker (Hono)
   -> ZITADEL v2 Session + native OTP Email challenge
   -> ZITADEL callback
   -> original OIDC redirect URI
```

The Pages application reads the non-secret `globalThis.ZITADEL_LOGIN_CONFIG.apiOrigin` value from `client/public/config.js`. An empty value uses the current page origin. The Worker keeps the authorization request reference and ZITADEL session tokens inside an encrypted flow cookie, resolves the callback through ZITADEL, and performs the final top-level redirect itself.

## Eligibility And Enrollment

The email-OTP path is a primary passwordless login option, not a second-factor screen. A request is eligible only when it resolves to exactly one active human user in the configured organization whose email is verified, matches the submitted address, matches any ZITADEL login hint, and has `AUTHENTICATION_METHOD_TYPE_OTP_EMAIL` enrolled.

Anonymous first-use enrollment is intentionally not supported: ZITADEL does not provide a trusted anonymous email-OTP enrollment path. The current bootstrap policy is to pre-enroll every active, verified-email human user, **including administrators for now**. Service users are excluded. Future users must be enrolled during trusted provisioning or after authenticating with an existing password, passkey, or identity provider. Administrator eligibility may be narrowed later without changing the fallback contract.

Enrollment itself sends no email. It adds the native OTP Email authentication method through ZITADEL administration; the sign-in flow then asks ZITADEL to generate, deliver, expire, throttle, and verify each code.

## Fallback Behavior

The Worker redirects to Login V2 without consuming the authorization request when a user is unknown, ambiguous, inactive, unverified, outside the organization, unenrolled, or otherwise cannot complete the native flow. The same fallback is used for account creation or account selection prompts. A `PROMPT_NONE` request never starts an interactive flow; it completes through the ZITADEL callback with `login_required`.

The fallback URL must be the configured ZITADEL origin and normally points to `/ui/v2/login`. The browser receives only relative continuation paths; callback URLs and authorization state remain Worker-controlled.

## Security Model

- `ZITADEL_LOGIN_CLIENT_PAT` is an encrypted Cloudflare Worker secret. It is never sent to or bundled for the browser.
- `FLOW_COOKIE_KEY` protects a `__Host-` cookie with AES-GCM authenticated encryption. The cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, host-only, and expires with the configured flow lifetime.
- CSRF tokens, strict origin checks, validated OIDC client and organization scopes, and safe callback-URL validation protect the browser-to-Worker handoff.
- Cloudflare Rate Limit is mandatory. Rate-limit keys are HMAC-derived and opaque; raw email addresses are never used as identifiers.
- Responses are `no-store` and include restrictive browser security headers. The Worker returns safe error messages rather than ZITADEL response bodies.
- No password, OTP, session token, callback URL, or raw email is persisted by this project outside the short-lived encrypted flow cookie and ZITADEL itself.

This is not a substitute for a security review, correct ZITADEL permissions, TLS, SMTP security, or Cloudflare account hardening.

## Configuration

Copy [`wrangler.example.jsonc`](./wrangler.example.jsonc) to `wrangler.jsonc` and keep the local file uncommitted. Use [`.dev.vars.example`](./.dev.vars.example) as the local Worker secret/value reference. `.env.example` is a generic reference file; Wrangler local development reads `.dev.vars`.

| Binding | Secret | Required value |
| --- | --- | --- |
| `ZITADEL_ORIGIN` | No | HTTPS ZITADEL origin, without a path. `http://localhost` is allowed for local development. |
| `ZITADEL_ORGANIZATION_ID` | No | Organization containing the Login App and eligible users. |
| `ZITADEL_ALLOWED_CLIENT_IDS` | No | Comma-separated allowlist of OIDC client IDs. |
| `LOGIN_V2_FALLBACK_URL` | No | ZITADEL Login V2 URL, using the same origin as `ZITADEL_ORIGIN`, normally `/ui/v2/login`. |
| `PAGES_ORIGIN` | No | Exact HTTPS Pages origin allowed to call the Worker. `http://localhost` is allowed locally. |
| `SESSION_LIFETIME_SECONDS` | No | Flow/session lifetime from `60` through `1800` seconds; the example uses `900`. |
| `ZITADEL_LOGIN_CLIENT_PAT` | Yes | ZITADEL machine-user PAT with the permissions required by the listed v2 APIs. Set as a Worker secret. |
| `FLOW_COOKIE_KEY` | Yes | 32 random bytes as unpadded base64url, exactly 43 characters. Set as a Worker secret. |
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

## Local Development

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

## Testing And Builds

```bash
bun run format:check
bun run type-check
bun run test
bun run build
```

Tests use mocked ZITADEL responses and cover the browser/Worker contract, encrypted state rotation, callback handling, fallback behavior, origin checks, malformed state, safe errors, and opaque rate-limit keys. They do not contact a live ZITADEL instance.

## Cloudflare Deployment

The deploy script builds both artifacts, deploys the Worker from `wrangler.jsonc`, and uploads `dist/client` to the Pages project. It does not create projects, configure domains, or set secrets.

```bash
bunx wrangler login
cp wrangler.example.jsonc wrangler.jsonc
# Edit wrangler.jsonc and set the two secrets first.
bun run deploy
```

Use `PAGES_PROJECT_NAME` to select a different Pages project and `WRANGLER_CONFIG` to select a different local Worker config:

```bash
PAGES_PROJECT_NAME=my-login WRANGLER_CONFIG=wrangler.jsonc bun run deploy
```

Before the build, configure `client/public/config.js` with the deployed Worker origin when Pages and Worker use different origins. Keep `PAGES_ORIGIN` equal to the public Pages URL. A same-origin custom-domain setup can leave `apiOrigin` empty.

## ZITADEL Setup

The following assumes the deployed ZITADEL/Login V2 API version is v4.16.0.

1. Create or select the organization and OIDC Login App. Record its client ID and put it in `ZITADEL_ALLOWED_CLIENT_IDS`.
2. Configure the application Login V2 base URI to send authorization requests to the Pages `/login` route. Preserve the original OIDC redirect URIs on the client application.
3. Keep Login V2 enabled at `/ui/v2/login`; it is the fallback and rollback path.
4. Create a least-privileged machine user/PAT for the Worker. It must be able to read the allowed Auth Request and user/authentication-method state, create and update v2 Sessions, and complete or reject the OIDC Auth Request. Store the PAT only as `ZITADEL_LOGIN_CLIENT_PAT`.
5. Pre-enroll the current eligible population with native OTP Email, including administrators under the current policy. Do not enroll service users. Confirm active state and verified email before each administrative enrollment.
6. Configure SMTP in ZITADEL and set the native `VerifyEmailOTP` message fields. Start from [`ops/zitadel/message-texts/VerifyEmailOTP.v1.en.json`](./ops/zitadel/message-texts/VerifyEmailOTP.v1.en.json) and the German variant. Keep the `{{.OTP}}` placeholder. These files provide message fields only; ZITADEL retains its native HTML shell and SMTP delivery.
7. Use an enrolled, non-privileged test user for the first live test. Confirm unknown and unenrolled users reach Login V2 and that `PROMPT_NONE` returns `login_required`.

The message artifacts prefer the existing `auth@contentoren.de` sender where available, with `it@contentoren.de` as the fallback sender decision from the project setup. Sender identity and SMTP credentials are configured in ZITADEL, not this repository.

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

- Only users already enrolled with native ZITADEL OTP Email can use the passwordless path.
- There is no anonymous enrollment, password reset, account recovery, or independent identity database here.
- Eligibility currently targets one configured ZITADEL organization and exact, verified email matches. Administrators are included in the initial pre-enrollment policy.
- Email delivery and message rendering are controlled by ZITADEL and its SMTP configuration. The supplied artifacts cannot replace ZITADEL's complete email HTML template.
- A Cloudflare Rate Limit binding and encrypted Worker secrets are required for a meaningful deployment.
- The browser is a static SPA and the Worker is a separate origin unless routing or a custom domain makes them same-origin.
- Automated tests are mocked contract tests. Live ZITADEL enrollment, deployment, SMTP delivery, and end-to-end OIDC verification remain environment-specific.
- This project has not been represented as independently audited security software.

## License

MIT © [David Siewert](https://david-siewert.com/)
