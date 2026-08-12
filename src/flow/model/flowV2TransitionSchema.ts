import * as v from "valibot"
import { passkeyOptionsSchema } from "../../passkey/model/passkeyOptionsSchema"
import { recentAccountSummarySchema } from "../../session/model/recentAccountSummarySchema"

const relativePathSchema = v.pipe(v.string(), v.regex(/^\/[^\\]*$/), v.maxLength(500))
const renderSchema = v.strictObject({
  kind: v.literal("render"),
  route: relativePathSchema,
  screen: v.variant("name", [
    v.strictObject({
      name: v.literal("email_otp_start"),
      loginHint: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(254))),
      recentAccounts: v.optional(v.array(recentAccountSummarySchema)),
    }),
    v.strictObject({ name: v.literal("email_otp_code") }),
    v.strictObject({ name: v.literal("mfa_email_otp_code"), challengeIssued: v.boolean() }),
    v.strictObject({ name: v.literal("mfa_sms_otp_code"), challengeIssued: v.boolean() }),
    v.strictObject({
      name: v.literal("mfa"),
      factors: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
      options: v.optional(passkeyOptionsSchema),
    }),
    v.strictObject({ name: v.literal("mfa_totp_setup") }),
    v.strictObject({
      name: v.literal("mfa_webauthn_setup"),
      method: v.picklist(["u2f", "passkey"]),
    }),
    v.strictObject({
      name: v.literal("passkey"),
      options: passkeyOptionsSchema,
    }),
    v.strictObject({ name: v.literal("idp_account_not_found") }),
    v.strictObject({ name: v.literal("password_change_required"), expired: v.boolean() }),
  ]),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})
const fallbackSchema = v.strictObject({ kind: v.literal("fallback"), path: relativePathSchema })
const completeSchema = v.strictObject({ kind: v.literal("complete"), path: relativePathSchema })

export const flowV2TransitionSchema = v.variant("kind", [renderSchema, fallbackSchema, completeSchema])

export type FlowV2Transition = v.InferOutput<typeof flowV2TransitionSchema>
