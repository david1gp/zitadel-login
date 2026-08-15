# Software ZITADEL login rollout

## Goal

Route the `software` application through the existing custom ZITADEL login, deploy the login Worker configuration required for its OIDC client, and verify the complete sign-in and callback flow with the existing `ssotest` account.

## Decisions

- Preserve `auth.contentoren.de` as issuer and native Login V2 as fallback.
- Use `https://login.contentoren.de` as the per-application Login V2 base URI.
- Add only the `software` OIDC client to the Worker allowlist.
- Keep deployment/runtime values in `.env.production`; never commit or print secrets.
- Copy the existing `ssotest` credentials from `~/leo/contentoren-server/zitadel` into the software project's local environment and mention their intended use in one line in `AGENTS.md`.

## Approach

- Inspect the local login repository and remote `~/projects/software` project before changing configuration.
- Ensure the software domain is registered through remote `caddy-projects`.
- Provision or reconcile a dedicated ZITADEL OIDC application with the correct redirect URIs and custom Login V2 base URI.
- Update and deploy the login Worker before enabling custom-login routing for the application.
- Update the software project to use the new OIDC settings and production environment file.
- Verify local checks, remote deployment health, native fallback, and the browser E2E login flow.

## Tasks

- [x] 1. Inspect current login Worker, ZITADEL provisioning, remote software project, domain, and existing ssotest setup.
- [x] 2. Add or reconcile the software domain in remote caddy-projects.
- [x] 3. Provision the software ZITADEL OIDC application and record its non-secret identifiers and required settings.
- [x] 4. Configure and deploy the login Worker for the software client using `.env.production` and runtime credentials.
- [x] 5. Make the required software-project OIDC, environment, deployment, and AGENTS.md changes.
- [x] 6. Deploy software and verify the full browser login/callback flow with ssotest credentials plus native fallback.

## Paths

- `docs/20260815_software_zitadel_login.md`
- `wrangler.jsonc`
- `.env.production`
- remote `~/projects/software`
- remote `~/leo/contentoren-server/zitadel`

## Current context

- Remote project: `/home/leo/projects/software`, clean working tree, Vite service on port `3107`.
- `software.contentoren.de` is already present in the remote `software` Caddy project.
- Software currently supports issuer `https://auth.contentoren.de` through environment-driven OIDC settings.
- Login Worker configuration is in ignored `wrangler.jsonc`; `.env.*` is ignored and `.env.production` does not yet exist.
- The ssotest source is local at `/home/david/leo/contentoren-server/zitadel`, not on `leo-server`.
- ZITADEL Software Web client ID is `386349346007875588`; its canonical callback is `https://projects.contentoren.de/login/zitadel/callback` and per-app Login V2 base URI is `https://login.contentoren.de`.
- The generated client secret is stored only in remote ignored `/home/leo/projects/software/.env.production` with mode `0600`.
- Live instance Login V2 is `required=false` with no global base URI, allowing the Software app's per-app custom URI to take effect.
- Worker production allowlist is explicitly `385726207456444420,386349346007875588`; production version is `ae1a0fec-596d-4dcc-ba40-c59f4660404d`.
- Remote software now loads `.env.production` in its systemd unit; ignored `.env` contains `E2E_STAFF_EMAIL` and `E2E_STAFF_PASSWORD`, and `AGENTS.md` documents their required E2E use in one line.
- Unsupported MFA-required password flows delegate to native Login V2; the ssotest account uses password-only authentication for credential-only E2E.
- Browser E2E completes custom login, canonical callback, authenticated session, logout, subsequent login, alias routing, and native fallback.
