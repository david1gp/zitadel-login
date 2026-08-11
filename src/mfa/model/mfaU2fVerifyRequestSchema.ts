import * as v from "valibot"

import { passkeyCredentialAssertionSchema } from "../../passkey/model/passkeyVerifyRequestSchema"

export const mfaU2fVerifyRequestSchema = v.pipe(
  v.strictObject({
    credential: v.optional(passkeyCredentialAssertionSchema),
    assertion: v.optional(passkeyCredentialAssertionSchema),
    csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
    method: v.optional(v.string()),
  }),
  v.check((input) => Boolean(input.credential || input.assertion), "Either credential or assertion must be provided"),
)

export type MfaU2fVerifyRequest = v.InferOutput<typeof mfaU2fVerifyRequestSchema>
