import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { PasswordChangeRequiredOutcome } from "../model/PasswordChangeRequiredOutcome"
import { passwordChangeErrorMessageGet } from "../model/passwordChangeErrorMessageGet"

const successSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

const retrySchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.picklist(["credentials_invalid", "password_policy_invalid"]),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  expiresAt: v.pipe(v.number(), v.integer()),
})

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.string(),
  errorMessage: v.string(),
})

export async function passwordChangeRequiredApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { currentPassword: string; newPassword: string; csrfToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<Result<PasswordChangeRequiredOutcome>> {
  const op = "passwordChangeRequiredApiRequest"
  const url = new URL("/api/v2/password/change-required", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)

  let response: Response
  try {
    response = await fetchFn(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        csrfToken: input.csrfToken,
      }),
    })
  } catch (error) {
    return resultErrorCreate(op, passwordChangeErrorMessageGet("service_unavailable"), error)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }

  if (!response.ok) {
    const retryable = v.safeParse(retrySchema, json)
    if (retryable.success) {
      return resultCreate<PasswordChangeRequiredOutcome>({
        status: "retryable",
        errorMessage: passwordChangeErrorMessageGet(retryable.output.errorMessage),
        csrfToken: retryable.output.csrfToken,
        expiresAt: retryable.output.expiresAt,
      })
    }
    const parsedError = v.safeParse(errorSchema, json)
    const code = parsedError.success ? parsedError.output.errorMessage : "service_unavailable"
    return resultErrorCreate(op, passwordChangeErrorMessageGet(code))
  }

  const parsed = v.safeParse(successSchema, json)
  if (!parsed.success) return resultErrorCreate(op, "The sign-in service returned an invalid response.", json)
  return resultCreate<PasswordChangeRequiredOutcome>({ status: "transition", transition: parsed.output.data })
}
