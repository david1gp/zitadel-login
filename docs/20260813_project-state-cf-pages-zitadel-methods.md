# Project state, Cloudflare Pages, and ZITADEL login coverage

## Goal

Assess the current project, deploy it to Cloudflare Pages, verify appropriate icons for every login method, and compare implemented login methods with the local ZITADEL source at `~/opensource/zitadel`, excluding SMS from the implementation requirement.

## Decisions

- Treat `~/opensource/zitadel` as the reference for supported ZITADEL login methods.
- SMS is audit-only and is not required to be implemented.
- Make only the smallest changes needed to achieve complete non-SMS method and icon coverage.
- Expected non-SMS methods are password, passkey/WebAuthn, TOTP, email OTP, and external identity provider/SSO.
- The project exposes those primary and MFA methods, with method-specific icons and generic/provider-specific identity-provider icons.
- Reconciliation against `~/opensource/zitadel`: password, passkey/WebAuthn, passwordless/email OTP, TOTP, email OTP, U2F, and external IdP/SSO are covered. Recovery code remains an intentional native fallback, private-key authentication is not a browser login method, and SMS remains audit-only.
- No application or icon implementation change is required before deployment; the smallest correct task-3 change is documentation only.
- The Cloudflare Pages frontend is paired with a Cloudflare Worker and uses the repository deployment workflow.
- Use the existing Cloudflare account settings and tokens from `~/leo/leo-server/env` for deployment without copying them into tracked files or disclosing their values.
- Record the reusable Cloudflare credential location in `AGENTS.md` so future deployments avoid the recurring account/authentication mismatch.
- The current build is deployed to the existing `zitadel-login` Pages project and paired Worker; production is available at `https://login.contentoren.de` and `https://zitadel-login.pages.dev`.

## Approach

- Inspect project structure, repository state, scripts, deployment configuration, login methods, and icons.
- Independently inspect the ZITADEL source for authoritative login-method coverage.
- Reconcile findings and implement any missing non-SMS methods or icon fixes incrementally.
- Verify locally, then deploy using the repository's supported Cloudflare Pages workflow.

## Tasks

1. [completed] Audit the current project, login methods, icons, tests, and Cloudflare Pages readiness.
2. [completed] Audit login methods in the local ZITADEL source and define expected non-SMS coverage.
3. [completed] Reconcile both audits and identify the smallest required changes; no application or icon change is required.
4. [completed] Implement and verify missing login methods and icon corrections; reconciliation confirmed no changes were needed.
5. [completed] Deploy to Cloudflare Pages and verify the deployed application.
6. [completed] Document the Cloudflare credential source in `AGENTS.md`.
7. [completed] Report project state, coverage, verification, and deployment URL.
8. [completed] Create a semantic commit containing only `AGENTS.md` and push it.

## Paths

- `docs/20260813_project-state-cf-pages-zitadel-methods.md`
- `~/opensource/zitadel`
- `~/leo/leo-server/env`
- `AGENTS.md`
