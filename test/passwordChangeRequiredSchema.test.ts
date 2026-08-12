import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { flowV2TransitionSchema as clientTransitionSchema } from "../client/src/flow/model/flowV2TransitionSchema"
import { flowV2CookieSchema } from "../src/flow/model/flowV2CookieSchema"
import { flowV2TransitionSchema as workerTransitionSchema } from "../src/flow/model/flowV2TransitionSchema"

const transition = {
  kind: "render" as const,
  route: `/login/password?flow=${"A".repeat(22)}`,
  screen: { name: "password_change_required" as const, expired: true },
  csrfToken: "B".repeat(43),
}

const state = {
  version: 2 as const,
  flowHandle: "A".repeat(22),
  requestKind: "oidc" as const,
  authRequestId: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  organizationId: "org-1",
  prompt: ["PROMPT_LOGIN" as const],
  csrfToken: "B".repeat(43),
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  transitionCounter: 1,
  stage: "password_change_required" as const,
  delegable: false as const,
  userId: "user-1",
  sessionId: "session-1",
  sessionToken: "latest-token",
  expired: true,
}

describe("password change required schemas", () => {
  test("accept strict display-safe Worker and browser transitions", () => {
    expect(v.safeParse(workerTransitionSchema, transition).success).toBe(true)
    expect(v.safeParse(clientTransitionSchema, transition).success).toBe(true)
    expect(JSON.stringify(transition)).not.toContain("user-1")
    expect(JSON.stringify(transition)).not.toContain("latest-token")
  })

  test("accept only nondelegable bound state and reject transition secrets", () => {
    expect(v.safeParse(flowV2CookieSchema, state).success).toBe(true)
    expect(v.safeParse(flowV2CookieSchema, { ...state, delegable: true }).success).toBe(false)
    expect(v.safeParse(workerTransitionSchema, { ...transition, sessionToken: "latest-token" }).success).toBe(false)
    expect(v.safeParse(clientTransitionSchema, { ...transition, userId: "user-1" }).success).toBe(false)
  })

  test("accepts only a nondelegable secret-free post-change recovery stage", () => {
    const { expired: _expired, ...stateBase } = state
    const changed = { ...stateBase, stage: "password_changed" as const }
    expect(v.safeParse(flowV2CookieSchema, changed).success).toBe(true)
    expect(v.safeParse(flowV2CookieSchema, { ...changed, delegable: true }).success).toBe(false)
    expect(v.safeParse(flowV2CookieSchema, { ...changed, currentPassword: "secret" }).success).toBe(false)
    expect(v.safeParse(flowV2CookieSchema, { ...changed, newPassword: "secret" }).success).toBe(false)
  })
})
