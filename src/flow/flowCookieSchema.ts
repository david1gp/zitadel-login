import * as v from "valibot"

const flowCookieBase = {
  version: v.literal(1),
  authRequestId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  issuedAt: v.pipe(v.number(), v.integer()),
  expiresAt: v.pipe(v.number(), v.integer()),
  hintUserId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
}

const requestFlowCookieSchema = v.strictObject({
  ...flowCookieBase,
  stage: v.literal("request"),
})

const sessionFlowCookieSchema = v.strictObject({
  ...flowCookieBase,
  stage: v.picklist(["otp", "verified"]),
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})

export const flowCookieSchema = v.variant("stage", [requestFlowCookieSchema, sessionFlowCookieSchema])

export type FlowCookie = v.InferOutput<typeof flowCookieSchema>
