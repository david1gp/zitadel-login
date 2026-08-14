import * as v from "valibot"

const expirySchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export function emailOtpCooldownExpiryResponseGet(response: Response, now = Date.now()): number | undefined {
  const expiry = Number(response.headers.get("X-Cooldown-Expires-At"))
  const parsedExpiry = v.safeParse(expirySchema, expiry)
  if (response.headers.has("X-Cooldown-Expires-At") && parsedExpiry.success) return parsedExpiry.output

  const retryAfter = Number(response.headers.get("Retry-After"))
  const parsedRetryAfter = v.safeParse(expirySchema, retryAfter)
  if (!response.headers.has("Retry-After") || !parsedRetryAfter.success) return undefined
  return Math.ceil(now / 1000) + parsedRetryAfter.output
}
