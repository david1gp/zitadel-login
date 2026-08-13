# Code Simplification Implementation

## Goal
Reduce duplicated implementation code and determine whether the client can safely move under `src`.

## Decisions
- Preserve flow-version, MFA-method, and cookie-domain boundaries.
- Share only repeated transport, parsing, and cryptographic mechanics.
- Do not move `client` under `src`; it has no build benefit, creates `src/client/src`, and weakens browser/Worker TypeScript boundaries.

## Approach
- Inspect build/tooling references to the current client location.
- Extract low-risk client transport and server request-boundary helpers incrementally.
- Simplify session transport and cookie crypto mechanics where duplication is structural.
- Extract narrowly scoped OTP shared utilities.
- Validate changed behavior with targeted and full checks.

## Tasks
1. Assess client relocation feasibility and map all affected tooling paths. — complete
2. Extract shared client JSON API transport for transition endpoints. — complete
3. Extract shared server request parsing, CSRF, and rate-limit primitives. — complete
4. Simplify ZITADEL session transport and cookie crypto mechanics. — complete
5. Extract safe shared OTP utilities. — complete
6. Retain the separate `client` root and document the recommendation. — complete
7. Run focused and full verification. — complete
8. Inspect the worktree and separate simplification changes from unrelated work before committing. — complete
9. Create scoped conventional commits and push them. — complete

## Paths
- `docs/20260813_code_simplification_implementation.md`
