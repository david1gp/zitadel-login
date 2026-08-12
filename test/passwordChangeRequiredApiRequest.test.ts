import { describe, expect, test } from "vitest"

import { passwordChangeRequiredApiRequest } from "../client/src/password/api/passwordChangeRequiredApiRequest"

const csrfToken = "B".repeat(43)
const rotatedCsrfToken = "C".repeat(43)
const origin = "https://login.example"
const flow = "AAAAAAAAAAAAAAAAAAAAAA"

const input = { currentPassword: "old-password", newPassword: "Str0ng-password!", csrfToken }

describe("passwordChangeRequiredApiRequest", () => {
  test("posts credentialed JSON with only currentPassword, newPassword and CSRF", async () => {
    let seenUrl = ""
    let seenInit: RequestInit | undefined
    const fetchFn = (async (url: URL, init?: RequestInit) => {
      seenUrl = url.toString()
      seenInit = init
      return Response.json({
        success: true,
        data: { kind: "complete", path: `/api/v2/flow/continue?flow=${flow}` },
      })
    }) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result.success).toBe(true)
    expect(seenUrl).toBe(`${origin}/api/v2/password/change-required?flow=${flow}`)
    expect(seenInit?.method).toBe("POST")
    expect(seenInit?.credentials).toBe("include")
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      currentPassword: "old-password",
      newPassword: "Str0ng-password!",
      csrfToken,
    })
    expect(String(seenInit?.body)).not.toContain("confirmation")
  })

  test("maps retryable credential failures to a rotated CSRF outcome", async () => {
    const fetchFn = (async () =>
      Response.json(
        {
          success: false,
          op: "passwordChangeRequired",
          errorMessage: "credentials_invalid",
          csrfToken: rotatedCsrfToken,
          expiresAt: 2000,
        },
        { status: 401 },
      )) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result).toEqual({
      success: true,
      data: {
        status: "retryable",
        errorMessage: "Your current password is incorrect.",
        csrfToken: rotatedCsrfToken,
        expiresAt: 2000,
      },
    })
  })

  test("maps retryable policy failures to a rotated CSRF outcome", async () => {
    const fetchFn = (async () =>
      Response.json(
        {
          success: false,
          op: "passwordChangeRequired",
          errorMessage: "password_policy_invalid",
          csrfToken: rotatedCsrfToken,
          expiresAt: 2000,
        },
        { status: 400 },
      )) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result.success && result.data.status).toBe("retryable")
    expect(result.success && result.data.status === "retryable" && result.data.errorMessage).toBe(
      "This password does not meet the password policy.",
    )
  })

  test("returns a generic error for non-retryable failures", async () => {
    const fetchFn = (async () =>
      Response.json(
        { success: false, op: "passwordChangeRequired", errorMessage: "flow_replayed" },
        { status: 409 },
      )) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result).toEqual({
      success: false,
      op: "passwordChangeRequiredApiRequest",
      errorMessage: "The sign-in request was already completed.",
    })
  })

  test("rejects malformed success payloads", async () => {
    const fetchFn = (async () =>
      Response.json({ success: true, data: { kind: "nonsense" } })) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result.success).toBe(false)
  })

  test("returns the fallback transition unchanged", async () => {
    const fetchFn = (async () =>
      Response.json({
        success: true,
        data: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flow}` },
      })) as unknown as typeof fetch

    const result = await passwordChangeRequiredApiRequest(origin, flow, input, fetchFn)

    expect(result.success && result.data).toEqual({
      status: "transition",
      transition: { kind: "fallback", path: `/api/v2/flow/fallback?flow=${flow}` },
    })
  })
})
