import * as v from "valibot"

import { passkeyAttestationSchema } from "../../passkey/model/passkeyAttestationSchema"

export const mfaWebAuthnEnrollmentVerifyRequestSchema = v.strictObject({
  method: v.picklist(["u2f", "passkey"]),
  credential: passkeyAttestationSchema,
  displayName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaWebAuthnEnrollmentVerifyRequest = v.InferOutput<typeof mfaWebAuthnEnrollmentVerifyRequestSchema>
