import * as v from "valibot"

export const sessionContinuePayloadSchema = v.strictObject({
  accountId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type SessionContinuePayload = v.InferOutput<typeof sessionContinuePayloadSchema>
