# Recent account overflow

## Goal
Prevent chooser content from being cut off at the bottom and fix the same layout risk on other screens.

## Decisions
- Preserve the intended visual design while making page-height and scrolling behavior robust across viewport sizes.
- Use safe item centering and stage scrolling in the shared desktop demo stage; leave production and mobile layouts unchanged.

## Approach
- Reproduce the issue at `/demo/chooser/recent-accounts` and identify the responsible shared or local layout styles.
- Audit sibling screens that use the same height/overflow patterns.
- Apply the smallest shared fix where possible and verify affected routes at constrained viewport sizes.

## Tasks
1. [complete] Reproduce and audit the cutoff, shared layout, and potentially affected screens.
2. [complete] Implement the smallest correct layout fix by adding safe item centering to the shared desktop demo stage.
3. [complete] Verify the target and other affected screens in a browser and run relevant checks.
4. [complete] Format, commit only the task changes in semantic commits, and push.

## Paths
- `docs/20260813_recent-account-overflow.md`
- `client/src/app/ui/App.tsx`
- `client/src/demo/model/demoScenarios.ts`
- `client/src/demo/ui/DemoApp.tsx`
- `client/src/ui/classes/classesDemoShell.ts`
- `client/src/ui/classes/classesDemoStage.ts`
- `client/src/ui/classes/classesLoginCard.ts`
- `client/src/ui/classes/classesPageShell.ts`
- Route: `/demo/chooser/recent-accounts`
