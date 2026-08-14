# Email OTP resend cooldown

## Goal

Enforce a server-authoritative 60-second email OTP resend cooldown, show a subtle reload-safe countdown in the browser, expose remaining cooldown to the active flow, add an isolated production-safe no-email limit test API, then validate locally and in production.

## Decisions

- Keep the existing Cloudflare Workers Rate Limiting binding for broad, permissive abuse protection.
- Use a SQLite-backed Durable Object as the authoritative, atomic 60-second cooldown reservation and status store.
- Use purpose-scoped HMAC object names based on the authentication request so V2 and legacy paths share the relevant cooldown without exposing identifiers.
- Treat encrypted flow state and local storage as display continuity/fast rejection only; neither grants permission to send.
- Return cooldown expiry/remaining-time metadata from resend and status APIs, with `Retry-After` on cooldown rejection.
- Isolate the no-email test API from real OTP scopes and ZITADEL calls, require a production secret, and exercise the same Durable Object primitive under a synthetic purpose.
- Apply the reservation before every primary, MFA email, enrollment, and legacy operation that can trigger email delivery; decoys reserve equivalently.

## Approach

- Add a Durable Object binding/export and atomic reserve/status operations with expiry cleanup.
- Centralize cooldown response and time calculations.
- Reserve before every relevant ZITADEL email challenge and fail closed when reservation is unavailable.
- Read authoritative status from the Durable Object in same-origin browser endpoints.
- Persist only cooldown expiry identifiers in scoped local storage and reconcile them with server status.
- Add an authenticated synthetic endpoint that performs only isolated Durable Object decisions.

## Tasks

1. **Done** — Add cooldown contracts, encrypted display state, status/resend metadata, persistent countdown UI, and authenticated synthetic API shell.
2. **Done** — Add the SQLite-backed Durable Object atomic reservation/status primitive and Cloudflare configuration.
3. **Done** — Gate V2 primary initial send/resend with the Durable Object and make primary status authoritative.
4. **Done** — Gate V2 MFA email challenge/enrollment/resend with the Durable Object and make MFA status authoritative.
5. **Done** — Gate legacy primary email initial send/resend with the shared Durable Object purpose.
6. **Done** — Move the isolated no-email production test API to the synthetic Durable Object scope and remove redundant dedicated exact-limit bindings.
7. **Done** — Add and update unit, integration, component, concurrency, legacy, and API contract tests.
8. **Done** — Run formatting, type checks, tests, build, and browser validation; fix only cooldown-related failures.
9. **Done** — Deploy using runtime Cloudflare credentials.
10. **Done** — Validate cooldown/status/test API behavior against production without sending email.

## Paths

- `src/config/workerBindingsSchema.ts`
- `src/http/`
- `src/email-otp/cooldown/`
- `src/flow/http/flowV2RouterCreate.ts`
- `src/flow/model/flowV2CookieSchema.ts`
- `src/worker/workerAppCreate.ts`
- `client/src/email-otp/`
- `client/src/mfa/`
- `test/`
- `wrangler.jsonc`
- `wrangler.example.jsonc`
- `README.md`
