import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { PasswordResetSetOutcome } from "../model/PasswordResetSetOutcome"
import { passwordRecoveryErrorMessageGet } from "../model/passwordRecoveryErrorMessageGet"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: v.strictObject({ status: v.literal("complete") }),
})
const retryableSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.literal("password_policy_invalid"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})
const errorSchema = v.strictObject({ success: v.literal(false), op: v.string(), errorMessage: v.string() })

export async function passwordResetSetApiRequest(
  apiOrigin: string,
  input: { password: string; csrfToken: string },
): Promise<Result<PasswordResetSetOutcome>> {
  const op = "passwordResetSetApiRequest"
  const url = new URL("/api/v2/password/reset/set", apiOrigin || window.location.origin)
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: input.password, csrfToken: input.csrfToken }),
    })
  } catch (error) {
    return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"), error)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"), error)
  }

  if (!response.ok) {
    const retryable = v.safeParse(retryableSchema, json)
    if (retryable.success) {
      return resultCreate<PasswordResetSetOutcome>({
        status: "retryable",
        errorMessage: passwordRecoveryErrorMessageGet(retryable.output.errorMessage),
        csrfToken: retryable.output.csrfToken,
        expiresAt: retryable.output.expiresAt,
      })
    }
    const parsedError = v.safeParse(errorSchema, json)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    const terminalCodes = ["invalid_link", "csrf_rejected", "capability_disabled", "invalid_payload"]
    if (!terminalCodes.includes(code)) return resultErrorCreate(op, passwordRecoveryErrorMessageGet(code))
    return resultCreate<PasswordResetSetOutcome>({
      status: "terminal",
      errorMessage: passwordRecoveryErrorMessageGet(code),
    })
  }

  const parsed = v.safeParse(responseSchema, json)
  if (!parsed.success) return resultErrorCreate(op, passwordRecoveryErrorMessageGet("service_unavailable"))
  return resultCreate<PasswordResetSetOutcome>({ status: "complete" })
}
