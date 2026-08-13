# zitadel-login

## Goal

Create, publish, deploy, and integrate `@adaptive-ds/zitadel-login`: a passwordless email-OTP ZITADEL Login App for non-technical users, with the existing Login V2 retained as fallback, a Cloudflare Worker service, and a static SolidJS Cloudflare Pages UI.

## Approach

Use ZITADEL’s native Session/Login APIs and existing SMTP path wherever they support a primary email-code flow. Keep credentials and security-sensitive orchestration in a Hono Worker, present the flow in a SolidJS/Vite Pages application, and preserve OIDC authorization context. Reuse the email-generator Login V1 template where compatible. Configure deployments through typed, Valibot-validated environment/Worker bindings and encrypted Cloudflare secrets rather than committed environment files or nested config documents.

## Tasks

1. **Completed** — Inspect sibling projects for files, package metadata, scripts, repository conventions, and release/deploy setup.
2. **Completed** — Inspect the self-hosted ZITADEL and Mailcow setup and identify supported native custom-login/email-OTP integration points.
3. **Completed** — Resolve major product, framework, enrollment, and repository decisions.
4. **Completed** — Confirm and design the exact native ZITADEL primary email-OTP flow, Login App handoff, enrollment behavior, and reusable email template.
5. **Completed** — Scaffold the repository, copy/adapt all requested project files, initialize Git, and verify package/tooling basics.
6. **Completed** — Implement the Worker service and native ZITADEL flow with validated configuration and Result-based domain logic.
7. **Completed** — Implement the SolidJS Pages UI and branded email-template integration.
8. **Completed** — Add Bun tests and securely verify the complete local flow.
9. **Completed** — Complete README and package metadata; verify formatting, tests, and builds.
10. **Completed** — Create the public GitHub repository and push without environment files or secrets.
11. **Completed** — Deploy Worker and Pages, configure ZITADEL, and run E2E against the designated test user.
12. **Completed** — Run final verification and push the deployed/configured state to GitHub.
13. **Completed** — Change fresh sign-ins to show a method chooser instead of auto-selecting preferred email OTP, listing only methods enabled by live ZITADEL policy and including email OTP.
14. **Completed** — Deploy the completed method-chooser UI to production, verify the deployment, and generate a fresh valid PKCE authorization link for manual testing.
15. **Completed** — Correct the production bootstrap organization query, restore live ZITADEL branding/logo, and make ZITADEL the primary runtime source of truth for completed login methods.
16. **Completed** — Formatting, semantic commits, and push completed.
17. **Completed** — Split bootstrap caching so branding is cached for 10 minutes while login policy and active identity providers remain cached for 60 seconds.
18. **Completed** — Formatting, the semantic commit containing only Task 17 split-cache changes, and push are completed.

## Paths

- Plan: `/home/david/adaptive/zitadel-login/docs/20260810_zitadel-login.md`
- Target: `/home/david/adaptive/zitadel-login`
- ZITADEL deployment: `/home/david/leo_internal/contentoren-server/zitadel`
- Mailcow deployment: `/home/david/leo_internal/contentoren-server/mailcow`
- Email reference: `/home/david/adaptive/email-generator`
- ZITADEL source: `/home/david/opensource/zitadel`
- GitHub: `https://github.com/david1gp/zitadel-login`
- Cloudflare Pages: `https://zitadel-login.pages.dev`
- Production login: `https://login.contentoren.de`

## Decisions

- ZITADEL is the primary runtime source of truth for completed login-method availability; the chooser uses implemented methods intersected with live ZITADEL policy.
- Bootstrap resolves the exact active configured organization and restores its live ZITADEL branding/logo rather than using the instance default or a static substitute.
- Branding cache duration: 10 minutes.
- Login policy and active identity provider cache duration: 60 seconds.
- Cache keys are unambiguous and versioned.
- Validation remains uncached.
- A single default-off `ZITADEL_CUSTOM_LOGIN_ENABLED` emergency switch replaces six per-method rollout flags and can route the custom flow to native Login V2.
- Failed bootstrap delegates without advertising login methods.
- Do not touch concurrent visual-demo files while completing this plan.
- Package: `@adaptive-ds/zitadel-login`; public GitHub repository `david1gp/zitadel-login`.
- Product flow: email OTP is a primary passwordless login option for users who cannot remember passwords, not a second-factor screen.
- Keep existing ZITADEL Login V2 as fallback; provide a specialized native ZITADEL Login App rather than replacing every login flow.
- Backend: Hono on Cloudflare Workers. Frontend: SolidJS/Vite static Cloudflare Pages application.
- Enrollment: self-service only after a trusted prior authentication; ZITADEL does not support anonymous first-use OTP Email enrollment.
- Runtime validation: Valibot. Error handling: project-owned Result library. Follow the code-style skill.
- Configuration: typed environment/Worker bindings validated at startup; Cloudflare secrets for credentials. Do not commit `.env` files or secret values.
- Reuse the `email-generator` Login V1 HTML template where technically compatible; prefer sender `auth@contentoren.de`, otherwise `it@contentoren.de`.
- ZITADEL must own authentication state and, where supported for the primary flow, OTP generation, delivery, expiry, throttling, and verification. Do not create a disconnected identity system.
- Keep the ZITADEL machine credential only in encrypted Worker secrets. The browser must never receive it.
- Preserve the initiating OIDC authorization context and complete authentication through ZITADEL’s native flow.
- Configure application Login V2 base URIs to send authorization requests to the Pages `/login` route; validate every auth request and allowed client ID in the Worker.
- Existing active users with a verified email and enrolled OTP Email can authenticate with email OTP as their only Session check; ZITADEL accepts that Session for the OIDC callback.
- Unknown, ambiguous, inactive, unverified, or unenrolled users fall back to Login V2 without consuming the authorization request.
- Store short-lived orchestration state only in an authenticated, encrypted, host-only, HttpOnly, Secure, SameSite=Lax cookie; redirect callback URLs from the Worker rather than exposing them as JSON.
- Required non-secret bindings: `ZITADEL_ORIGIN`, `ZITADEL_ORGANIZATION_ID`, `ZITADEL_ALLOWED_CLIENT_IDS`, `LOGIN_V2_FALLBACK_URL`, `PAGES_ORIGIN`, `SESSION_LIFETIME_SECONDS`, `ZITADEL_CUSTOM_LOGIN_ENABLED`.
- Required encrypted secrets: `ZITADEL_LOGIN_CLIENT_PAT`, `FLOW_COOKIE_KEY`.
- Native ZITADEL delivery cannot accept the complete `email-generator` HTML template. Adapt its SignIn V1 wording/branding into ZITADEL’s `VerifyEmailOTP` message fields while retaining ZITADEL’s native HTML shell and SMTP delivery.
- Passwordless bootstrap: administratively pre-enroll every active, verified-email human user, including administrators for now; exclude service users. Enroll future users during trusted provisioning or after prior password/passkey/IdP authentication. Preserve Login V2 fallback for unenrolled users. Administrator eligibility may be restricted later.
- Preparing `ssotest` requires resolving the live account by exact email, confirming it is active/non-privileged with verified email, and adding OTP Email once through the native administrative API; enrollment itself sends no email.
- Required scripts: `dev`, `test`, `build`, `release`, `format`.
- Use `email-generator` as the primary project baseline, supplemented by `solid-ui`/`convex-auth-solid` for SolidJS and Cloudflare Pages conventions and `cfb2` for Bun/Worker conventions.
- The deployed ZITADEL API and Login V2 version is `v4.16.0`; Login V2 is enabled at `/ui/v2/login` with Login V1 retained for rollback.
- Keep browser source under `client/` and Worker source under `src/`, with separate strict TypeScript configurations for DOM and WebWorker environments.
- Use `/home/david/opensource/zitadel` for ZITADEL source inspection; clone into that path only if it does not exist instead of creating temporary clones or web-fetching GitHub source.
- Apply a mandatory Cloudflare Rate Limit binding using HMAC-opaque keys; never expose raw normalized email addresses in rate-limit identifiers.
- Accept OIDC callback URLs only when they match the validated ZITADEL origin and expected callback contract.
- The Pages UI reads a non-secret runtime API origin from `globalThis.ZITADEL_LOGIN_CONFIG.apiOrigin`, defaulting to same-origin.
- Browser-facing APIs expose only relative Worker continuation paths. The Worker retains sensitive OIDC callback destinations and performs the final top-level redirect.
- Keep English and German native `VerifyEmailOTP` message-field artifacts under `ops/zitadel/message-texts/`, using ZITADEL’s `{{.OTP}}` placeholder and native delivery shell.
- GitHub repository is public on `main`; environment files, local Wrangler state/config, keys, dependencies, and build output are ignored.
- Production routing target: static Pages at `https://login.contentoren.de` with the Worker on the same origin for `/api/*`; the Pages fallback deployment is live at `https://zitadel-login.pages.dev`.
- Cloudflare production routing is active: Pages serves `login.contentoren.de`, the Worker handles `login.contentoren.de/api/*`, and encrypted Worker secrets provide the login-client PAT and flow-cookie key.
- `ops:zitadel:otp-email` is the idempotent organization configuration command; dry-run is default and `ZITADEL_OTP_MODE=apply` is required for mutations.
- All current active Contentoren human users with verified primary email, including administrators, are enrolled in native OTP Email. Service users remain excluded.
- ZITADEL uses the preferred SMTP sender; English and German VerifyEmailOTP message fields are applied from the repository artifacts.
- A dedicated Contentoren public OIDC Authorization Code + S256 PKCE client provides isolated E2E coverage with a loopback callback and application-specific Login App base URI `https://login.contentoren.de`.
- ZITADEL Login V2 is not instance-required and has no global custom base URI, allowing application-specific routing while retaining native Login V2 fallback.
- Accept native ZITADEL email OTP codes containing 6–20 digits; the deployed provider currently issues 8-digit codes.
- Live E2E uses the dedicated PKCE client and confirms the complete authorization request, native email delivery, OTP verification, callback state, token exchange, and intended-user userinfo response.
