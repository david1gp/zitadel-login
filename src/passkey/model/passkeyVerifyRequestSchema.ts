import * as v from "valibot"

const base64UrlString = (minLen: number, maxLen: number) =>
  v.pipe(v.string(), v.minLength(minLen), v.maxLength(maxLen), v.regex(/^[A-Za-z0-9_-]+$/))

export const passkeyAssertionResponseSchema = v.strictObject({
  clientDataJSON: base64UrlString(1, 8192),
  authenticatorData: base64UrlString(1, 4096),
  signature: base64UrlString(1, 4096),
  userHandle: v.optional(v.nullable(v.union([base64UrlString(0, 500), v.literal("")]))),
})

export const passkeyCredentialAssertionSchema = v.strictObject({
  id: base64UrlString(1, 500),
  rawId: base64UrlString(1, 500),
  type: v.literal("public-key"),
  response: passkeyAssertionResponseSchema,
})

export const passkeyVerifyRequestSchema = v.pipe(
  v.strictObject({
    credential: v.optional(passkeyCredentialAssertionSchema),
    assertion: v.optional(passkeyCredentialAssertionSchema),
    csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  }),
  v.check((input) => Boolean(input.credential || input.assertion), "Either credential or assertion must be provided"),
)

export type PasskeyCredentialAssertion = v.InferOutput<typeof passkeyCredentialAssertionSchema>
export type PasskeyVerifyRequest = v.InferOutput<typeof passkeyVerifyRequestSchema>
