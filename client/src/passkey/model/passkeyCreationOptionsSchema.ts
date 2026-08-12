import * as v from "valibot"

const base64UrlString = (minLength: number, maxLength: number) =>
  v.pipe(v.string(), v.minLength(minLength), v.maxLength(maxLength), v.regex(/^[A-Za-z0-9_-]+$/))

const excludeCredentialSchema = v.strictObject({
  id: base64UrlString(1, 500),
  type: v.literal("public-key"),
  transports: v.optional(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(50)))),
})

const credentialParametersSchema = v.strictObject({
  alg: v.pipe(v.number(), v.integer(), v.minValue(-1000), v.maxValue(1000)),
  type: v.literal("public-key"),
})

export const publicKeyCreationOptionsSchema = v.strictObject({
  attestation: v.literal("none"),
  authenticatorSelection: v.strictObject({
    userVerification: v.picklist(["required", "preferred", "discouraged"]),
  }),
  challenge: base64UrlString(1, 1024),
  excludeCredentials: v.optional(v.array(excludeCredentialSchema)),
  pubKeyCredParams: v.pipe(v.array(credentialParametersSchema), v.minLength(1), v.maxLength(32)),
  rp: v.strictObject({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(253)),
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
  timeout: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(600000)),
  user: v.strictObject({
    displayName: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    id: base64UrlString(1, 500),
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
})

export const passkeyCreationOptionsSchema = v.strictObject({
  publicKey: publicKeyCreationOptionsSchema,
})

export type PasskeyCreationOptions = v.InferOutput<typeof passkeyCreationOptionsSchema>
