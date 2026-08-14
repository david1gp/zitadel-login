# Last Used Login Method

## Goal

Remember the most recent primary login method and second-factor method that each completed successfully, then make those choices easier to spot with a “Last used” badge and a stronger colorful border.

## Decisions

- Persist only after a successful `complete` transition; selecting, failing, or falling back must not change the remembered method.
- Keep primary-login and MFA memories separate.
- Preserve the identity-provider identifier so the exact provider choice can be highlighted.
- Scope persisted values by organization and use the existing safe browser-storage abstraction; unavailable or malformed storage must not block login.
- Highlight only a currently available matching choice, with accessible badge text and styling that remains clear in supported themes.
- Apply the MFA highlight to the factor-selection chooser, not enrollment or recovery-only actions.

## Approach

- Add a small typed persistence model for loading and saving successful primary and MFA method identifiers.
- Wire the current selected method through successful authentication transitions so persistence occurs immediately before continuation.
- Pass loaded values into the primary and MFA chooser views and extend the shared method-choice presentation with an optional last-used state.
- Cover storage edge cases, success-only updates, exact provider/factor matching, chooser rendering, and interaction regressions.

## Tasks

1. **Complete** — Implement typed, organization-scoped last-used method persistence with malformed/unavailable-storage handling and focused tests.
2. **Complete** — Record the selected primary method and MFA factor only when their authentication transition completes successfully; add focused state/flow tests.
3. **Complete** — Render the “Last used” badge and colorful border for matching primary and MFA choices, with component tests.
4. **Complete** — Run formatting, type checks, tests, build, and browser verification of both chooser variants.

## Paths

- `client/src/preferences/model/`
- `client/src/app/ui/appStateCreate.ts`
- `client/src/app/ui/App.tsx`
- `client/src/flow/ui/MethodChooser.tsx`
- `client/src/flow/ui/MethodChoiceButton.tsx`
- `client/src/mfa/ui/`
- `client/src/ui/classes/`
- `test/`
