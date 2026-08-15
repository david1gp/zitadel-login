import { describe, expect, test } from "bun:test"
import { primaryFlowMfaPolicyEvaluate } from "../src/flow/domain/primaryFlowMfaPolicyEvaluate"

describe("primaryFlowMfaPolicyEvaluate", () => {
  test("keeps a password flow custom when recovery codes accompany a supported MFA factor", () => {
    expect(
      primaryFlowMfaPolicyEvaluate({
        method: "password",
        methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"],
        emailVerified: false,
        phoneVerified: false,
        policy: {
          forceMfa: true,
          secondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_RECOVERY_CODES"],
        },
      }),
    ).toEqual({
      supported: true,
      required: true,
      methods: ["AUTHENTICATION_METHOD_TYPE_TOTP"],
    })
  })

  test("still falls back when recovery codes are the only forced MFA option", () => {
    expect(
      primaryFlowMfaPolicyEvaluate({
        method: "password",
        methods: ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_RECOVERY_CODE"],
        emailVerified: false,
        phoneVerified: false,
        policy: {
          forceMfa: true,
          secondFactors: ["SECOND_FACTOR_TYPE_RECOVERY_CODES"],
        },
      }),
    ).toEqual({ supported: false, required: false, methods: [] })
  })
})
