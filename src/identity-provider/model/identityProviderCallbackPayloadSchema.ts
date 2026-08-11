import * as v from "valibot"

export const identityProviderCallbackPayloadSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  token: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})

export type IdentityProviderCallbackPayload = v.InferOutput<typeof identityProviderCallbackPayloadSchema>
