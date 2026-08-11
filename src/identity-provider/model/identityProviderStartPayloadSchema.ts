import * as v from "valibot"

export const identityProviderStartPayloadSchema = v.strictObject({
  idpId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type IdentityProviderStartPayload = v.InferOutput<typeof identityProviderStartPayloadSchema>
