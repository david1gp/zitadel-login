import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

const responseSchema = v.strictObject({
  success: v.literal(true),
  data: v.strictObject({
    cooldownExpiresAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
    cooldownRemainingSeconds: v.pipe(v.number(), v.integer(), v.minValue(0)),
  }),
})

export async function emailOtpCooldownApiRequest(
  apiOrigin: string,
  flowHandle: string,
  context: "primary" | "mfa",
  fetchFn: typeof fetch = fetch,
): Promise<Result<number>> {
  const op = "emailOtpCooldownApiRequest"
  const path = context === "mfa" ? "/api/v2/mfa/email-otp/cooldown" : "/api/v2/email-otp/cooldown"
  const url = new URL(path, apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  let response: Response
  try {
    response = await fetchFn(url, { credentials: "include" })
  } catch (error) {
    return resultErrorCreate(op, "Unable to check when another code can be sent.", error)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    return resultErrorCreate(op, "The sign-in service returned an invalid response.", error)
  }
  const parsed = v.safeParse(responseSchema, json)
  if (!response.ok || !parsed.success) {
    return resultErrorCreate(op, "Unable to check when another code can be sent.", json)
  }
  return resultCreate(parsed.output.data.cooldownExpiresAt)
}
