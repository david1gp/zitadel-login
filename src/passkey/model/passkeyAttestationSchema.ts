import * as v from "valibot"

const base64UrlString = (minLength: number, maxLength: number) =>
  v.pipe(v.string(), v.minLength(minLength), v.maxLength(maxLength), v.regex(/^[A-Za-z0-9_-]+$/))

const attestationResponseSchema = v.strictObject({
  attestationObject: base64UrlString(1, 1_048_576),
  clientDataJSON: base64UrlString(1, 8192),
})

export const passkeyAttestationSchema = v.strictObject({
  id: base64UrlString(1, 500),
  rawId: base64UrlString(1, 500),
  response: attestationResponseSchema,
  type: v.literal("public-key"),
})

export type PasskeyAttestation = v.InferOutput<typeof passkeyAttestationSchema>
