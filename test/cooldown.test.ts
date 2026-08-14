import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { cooldownExpiryCreate } from "../src/http/cooldownExpiryCreate"
import { cooldownMetadataCreate } from "../src/http/cooldownMetadataCreate"
import { cooldownMetadataSchema } from "../src/http/cooldownMetadataSchema"
import { cooldownRemainingSecondsGet } from "../src/http/cooldownRemainingSecondsGet"
import { cooldownRetryAfterSecondsGet } from "../src/http/cooldownRetryAfterSecondsGet"

describe("cooldown primitives", () => {
  test("calculates an expiry from the current time and duration", () => {
    expect(cooldownExpiryCreate(1_700_000_000, 60)).toBe(1_700_000_060)
  })

  test("rounds remaining time up and never returns a negative value", () => {
    expect(cooldownRemainingSecondsGet(1_700_000_060, 1_700_000_059.1)).toBe(1)
    expect(cooldownRemainingSecondsGet(1_700_000_060, 1_700_000_060)).toBe(0)
    expect(cooldownRemainingSecondsGet(1_700_000_060, 1_700_000_061)).toBe(0)
  })

  test("creates stable response metadata and a valid retry delay", () => {
    const metadata = cooldownMetadataCreate(1_700_000_060, 1_700_000_052.5)
    expect(metadata).toEqual({ cooldownExpiresAt: 1_700_000_060, cooldownRemainingSeconds: 8 })
    expect(v.safeParse(cooldownMetadataSchema, metadata).success).toBe(true)
    expect(cooldownRetryAfterSecondsGet(metadata)).toBe(8)
    expect(cooldownRetryAfterSecondsGet({ ...metadata, cooldownRemainingSeconds: 0 })).toBe(1)
  })
})
