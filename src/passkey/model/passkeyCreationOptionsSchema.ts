import * as v from "valibot"

const base64UrlString = (minLength: number, maxLength: number) =>
  v.pipe(v.string(), v.minLength(minLength), v.maxLength(maxLength), v.regex(/^[A-Za-z0-9_-]+$/))

const credentialDescriptorSchema = v.strictObject({
  id: base64UrlString(1, 500),
  type: v.literal("public-key"),
  transports: v.optional(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(50)))),
})

const publicKeyCredentialParametersSchema = v.strictObject({
  alg: v.pipe(v.number(), v.integer(), v.minValue(-1000), v.maxValue(1000)),
  type: v.literal("public-key"),
})

const relyingPartySchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(253)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

const userEntitySchema = v.strictObject({
  displayName: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  id: base64UrlString(1, 500),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

const publicKeyCredentialCreationOptionsSchema = v.strictObject({
  attestation: v.literal("none"),
  authenticatorSelection: v.strictObject({
    userVerification: v.picklist(["required", "preferred", "discouraged"]),
  }),
  challenge: base64UrlString(1, 1024),
  excludeCredentials: v.optional(v.array(credentialDescriptorSchema)),
  pubKeyCredParams: v.pipe(v.array(publicKeyCredentialParametersSchema), v.minLength(1), v.maxLength(32)),
  rp: relyingPartySchema,
  timeout: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(600000)),
  user: userEntitySchema,
})

export const passkeyCreationOptionsSchema = v.strictObject({
  publicKey: publicKeyCredentialCreationOptionsSchema,
})

export type PasskeyCreationOptions = v.InferOutput<typeof passkeyCreationOptionsSchema>
