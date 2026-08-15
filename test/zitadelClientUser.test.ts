import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const bindings = {
  ZITADEL_ORIGIN: "https://identity.example",
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: "https://identity.example/ui/v2/login",
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

describe("zitadelClientCreate user responses", () => {
  test("accepts ZITADEL users whose phone object has no fields", async () => {
    const client = zitadelClientCreate(bindings, async () =>
      Response.json({
        result: [
          {
            userId: "user-1",
            state: "USER_STATE_ACTIVE",
            preferredLoginName: "test@example.com",
            details: { resourceOwner: "org-1" },
            human: {
              email: { email: "test@example.com", isVerified: true },
              phone: {},
              passwordChanged: "2027-01-01T00:00:00Z",
            },
          },
        ],
      }),
    )

    const result = await client.usersByIdentifierList("test@example.com", "org-1")

    expect(result).toEqual({
      success: true,
      data: {
        result: [
          expect.objectContaining({
            userId: "user-1",
            human: expect.objectContaining({ phone: {} }),
          }),
        ],
      },
    })
  })
})
