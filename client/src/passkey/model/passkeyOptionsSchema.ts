import * as v from "valibot"

const allowCredentialSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  type: v.literal("public-key"),
  transports: v.optional(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(50)))),
})

export const publicKeyOptionsSchema = v.strictObject({
  challenge: v.pipe(v.string(), v.minLength(1), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/)),
  rpId: v.pipe(v.string(), v.minLength(1), v.maxLength(253)),
  timeout: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(600000))),
  userVerification: v.optional(v.picklist(["required", "preferred", "discouraged"])),
  allowCredentials: v.optional(v.array(allowCredentialSchema)),
})

export const passkeyOptionsSchema = v.strictObject({
  publicKey: publicKeyOptionsSchema,
})

export type PasskeyOptions = v.InferOutput<typeof passkeyOptionsSchema>
