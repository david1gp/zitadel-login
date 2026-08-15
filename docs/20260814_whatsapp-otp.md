# WhatsApp OTP

## Goal

Add an optional “send code via WhatsApp” primary-login path alongside email OTP while ZITADEL remains responsible for OTP generation, expiry, replay protection, verification, and session completion.

## Decisions

- Require an existing ZITADEL user with enrolled email OTP and a verified phone number.
- Treat WhatsApp as a delivery channel for a ZITADEL `otpEmail` challenge, not as a native ZITADEL factor; ZITADEL audit and OIDC semantics remain `otp_email` / `otp`.
- Request the challenge with `returnCode: true`, keep the plaintext code server-side, send it to the verified phone, and verify it through ZITADEL’s normal `checks.otpEmail.code` API.
- Keep email OTP available as the independent fallback and never silently switch delivery channels.
- Offer the WhatsApp action consistently and return generic outcomes so phone presence and WhatsApp reachability cannot enumerate accounts.
- Require an explicit per-send user action and clear copy stating that the message goes to the verified phone stored on the account.
- Do not check WhatsApp registration during login.
- Use self-hosted WAHA only for a non-production proof of concept. Production uses the official WhatsApp Business Platform or an approved provider.
- Put the provider call behind an application-owned adapter. Start with a minimal direct HTTP integration; adopt `@adaptive/waha-client` only after it redacts sensitive errors, disables send retries, and passes the exact runtime bundle test.
- Do not log OTPs, message bodies, full phone numbers, provider payloads, API keys, or session tokens.

## Approach

1. Add a server-only WhatsApp delivery boundary with normalized E.164-to-WAHA recipient conversion, strict timeouts, no automatic POST retries, redacted errors, and provider-accepted status only.
2. Add a WhatsApp OTP start/resend path parallel to email OTP. Reuse existing user eligibility, decoy behavior, CSRF, cooldown, rate limits, encrypted flow state, and ZITADEL verification.
3. Keep the UI channel-specific but provider-neutral. Explain prerequisites and preserve email fallback without exposing whether the account has a phone.
4. Validate the complete flow in a non-production ZITADEL organization and WAHA account before choosing the production provider.
5. Replace the proof-of-concept adapter with the official WhatsApp provider adapter for production without changing the authentication-domain flow.

## Tasks

- [ ] 1. Define the delivery adapter contract, redacted error model, recipient normalization, configuration bindings, and provider acceptance semantics.
- [ ] 2. Build a non-production WAHA adapter spike and verify networking, authentication, session health, recipient formatting, timeout behavior, and duplicate-send behavior.
- [ ] 3. Add ZITADEL `otpEmail.returnCode` support and prove challenge creation, verification, expiry, one-time use, token rotation, policy behavior, and audit/OIDC semantics.
- [ ] 4. Implement WhatsApp OTP domain start/resend/verify behavior with generic decoy outcomes, cooldown reservation, rate limiting, and encrypted flow state.
- [ ] 5. Add Worker routes and server-only configuration without exposing provider credentials or returned OTP codes to browser responses.
- [ ] 6. Add the channel chooser, prerequisite copy, code-entry/resend states, masked-channel copy where safe, and explicit email fallback.
- [ ] 7. Add unit, route, flow, abuse, failure, and regression tests; include provider timeout, ambiguous acceptance, unavailable phone, replay, resend, and account-enumeration cases.
- [ ] 8. Run non-production browser and live integration verification with synthetic users covering phone/no-phone, verified/unverified phone, enrolled/unenrolled email OTP, and forced-MFA policies.
- [ ] 9. Implement and validate the official WhatsApp Business provider adapter, consent/template configuration, delivery monitoring, and operational alerts before production enablement.
- [ ] 10. Roll out behind an environment/organization feature flag with email fallback and an immediate provider kill switch.

## Paths

- `src/whatsapp-otp/` — WhatsApp OTP domain and delivery boundary
- `client/src/whatsapp-otp/` — channel UI and browser state
- `src/zitadel/zitadelClientCreate.ts` — returned OTP challenge support
- `src/flow/http/flowV2RouterCreate.ts` — start, resend, and verify routes
- `src/flow/model/flowV2CookieSchema.ts` — encrypted challenge state
- `src/flow/model/flowV2TransitionSchema.ts` — flow transitions
- `src/config/workerBindingsSchema.ts` — server-only provider configuration
- `test/` — domain, Worker, flow, and abuse coverage
- `ops/zitadel/` — non-production enrollment and provider validation tooling
- `~/adaptive/waha-client` — optional client hardening if adopted
- `~/contentoren-server/waha` — intended WAHA deployment/bridge location, once available in the implementation environment
