import * as v from "valibot"

const boundedIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))
const timestampSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

const recentAccountSchema = v.strictObject({
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  organizationId: boundedIdSchema,
  authAt: timestampSchema,
  lastUsedAt: timestampSchema,
  expiresAt: timestampSchema,
})

export const recentAccountCookieSchema = v.strictObject({
  version: v.literal(1),
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  accounts: v.pipe(v.array(recentAccountSchema), v.maxLength(3)),
})

export type RecentAccount = v.InferOutput<typeof recentAccountSchema>
export type RecentAccountCookie = v.InferOutput<typeof recentAccountCookieSchema>
