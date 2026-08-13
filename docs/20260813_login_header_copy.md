# Goal

- Render one clear H1 per login screen instead of repeating the same meaning in scenario metadata, eyebrow text, and heading text.
- Show the organization name between the logo and theme switcher.

# Decisions

- Preserve the existing organization source, `bootstrap().organization.name`.
- Keep one semantic H1 in each login view; remove nearby metadata and eyebrow copy when they repeat the heading's meaning.
- Error and status scenarios follow the same rule: scenario metadata must not repeat any visible H1, regardless of differing group prefixes.
- Apply the header change to both production and demo shells.

# Approach

- Audit all login scenarios for the three-layer duplication pattern and simplify affected panels and demo presentation consistently.
- Render the organization name in the card-top layout between branding and theme controls.
- Verify automated checks and affected browser scenarios.

# Tasks

- [x] 1. Inspect the relevant UI composition, data flow, and test setup; identify exact files and a minimal implementation plan.
- [x] 2. Implement one-H1 recovery/password reset copy and organization name in the header.
- [x] 3. Verify focused tests, type/lint checks, and browser UI behavior.
- [x] 4. Audit all login screens for repeated scenario metadata, eyebrow, and H1 copy.
- [x] 5. Remove redundant copy consistently across all affected login screens.
- [x] 6. Verify all demo scenarios with automated checks and browser UI review.
- [x] 7. Compare rendered scenario metadata against H1 text across every demo route and identify remaining semantic duplicates.
- [x] 8. Remove all remaining duplicate scenario metadata, including identity-provider error states.
- [x] 9. Reverify every demo route by rendered text and publish the refreshed review URL.

# Paths

- `docs/20260813_login_header_copy.md`
- `client/src/app/ui/App.tsx`
- `client/src/demo/ui/DemoApp.tsx`
- `client/src/password-recovery/ui/PasswordRecoveryRequestPanel.tsx`
- `client/src/password-recovery/ui/PasswordResetPanel.tsx`
- `client/src/flow/ui/MethodChooser.tsx`
- `client/src/flow/ui/UnsupportedMethodPanel.tsx`
- `client/src/email-otp/ui/EmailOtpPanel.tsx`
- `client/src/identity-provider/ui/IdentityProviderPanel.tsx`
- `client/src/passkey/ui/PasskeyPanel.tsx`
- `client/src/password/ui/PasswordPanel.tsx`
- `client/src/password/ui/PasswordChangeRequiredPanel.tsx`
- `client/src/mfa/ui/MfaPanel.tsx`
- `client/src/mfa/ui/MfaEmailOtpPanel.tsx`
- `client/src/mfa/ui/MfaSmsOtpPanel.tsx`
- `client/src/mfa/ui/MfaTotpPanel.tsx`
- `client/src/mfa/ui/MfaTotpEnrollPanel.tsx`
- `client/src/mfa/ui/MfaU2fPanel.tsx`
- `client/src/mfa/ui/MfaWebAuthnEnrollPanel.tsx`
- `client/src/ui/classes/classesOrganizationName.ts`
- `test/App.component.tsx`
- `test/PasswordRecoveryRequestPanel.component.tsx`
- `test/PasswordResetPanel.component.tsx`
- `test/MethodChooser.component.tsx`
- `test/MfaPanel.component.tsx`
- `test/MfaEmailOtpPanel.component.tsx`
- `test/MfaSmsOtpPanel.component.tsx`
- `test/MfaTotpPanel.component.tsx`
- `test/MfaTotpEnrollPanel.component.tsx`
- `test/MfaU2fPanel.component.tsx`
- `test/MfaWebAuthnEnrollPanel.component.tsx`
- `test/DemoApp.component.tsx`
