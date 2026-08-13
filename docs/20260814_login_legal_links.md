# Login legal links

## Goal

Place the theme switcher above and right-aligned with the login card, and add subtle legal acknowledgement text below the card with environment-configured Terms of Service and Privacy Policy links. Ensure production and demo views both show the layout.

## Decisions

- Keep the theme behavior unchanged; only move its presentation outside the card.
- Expose both legal URLs through the existing server-to-client bootstrap contract rather than build-time client constants.
- Render the legal acknowledgement only when both configured URLs are valid and available.
- Give demo scenarios safe example URLs so the demo always presents both links.
- Open legal links normally and keep styling visually secondary, responsive, and accessible.

## Approach

- Extend environment bindings and bootstrap validation/projection with Terms and Privacy URLs.
- Add a shared outside-card layout/component used by production and demo screens.
- Update examples and operator documentation for the new values.
- Cover configuration, rendering, and demo defaults with automated tests and browser verification.

## Tasks

1. **Complete** — Added optional HTTPS legal URL environment bindings, bootstrap contract support, configuration examples, documentation, and focused tests.
2. **Complete** — Added a shared login frame with the theme switcher above/right, conditional legal acknowledgement below, and safe demo URLs.
3. **Complete** — Added production/demo rendering coverage and verified formatting, types, full tests, build, and both browser routes.

## Paths

- `src/branding/bootstrapViewGet.ts`
- `client/src/branding/model/bootstrapViewSchema.ts`
- `client/src/app/ui/App.tsx`
- `client/src/demo/ui/DemoApp.tsx`
- `client/src/demo/model/demoScenarios.ts`
- `client/src/ui/`
- `.env.example`
- `.dev.vars.example`
- `wrangler.example.jsonc`
- `README.md`
- `test/`
