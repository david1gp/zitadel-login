import * as v from "valibot"
import { passkeyOptionsSchema } from "../../passkey/model/passkeyOptionsSchema"

const handleSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{22}$/))
const boundedIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))
const promptSchema = v.array(
  v.picklist([
    "PROMPT_UNSPECIFIED",
    "PROMPT_NONE",
    "PROMPT_LOGIN",
    "PROMPT_CONSENT",
    "PROMPT_SELECT_ACCOUNT",
    "PROMPT_CREATE",
  ]),
)
const baseSchema = {
  version: v.literal(2),
  flowHandle: handleSchema,
  requestKind: v.literal("oidc"),
  authRequestId: boundedIdSchema,
  clientId: boundedIdSchema,
  redirectUri: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
  organizationId: boundedIdSchema,
  prompt: promptSchema,
  maxAgeSeconds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2_147_483_647))),
  loginHint: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(254))),
  hintUserId: v.optional(boundedIdSchema),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  issuedAt: v.pipe(v.number(), v.integer()),
  expiresAt: v.pipe(v.number(), v.integer()),
  transitionCounter: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
}

const readySchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("ready"),
  delegable: v.boolean(),
  owned: v.boolean(),
})
const silentSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("silent"),
  delegable: v.literal(false),
})
const otpSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("otp"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const otpDecoySchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("otp_decoy"),
  delegable: v.literal(false),
})
const passkeySchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("passkey"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  options: passkeyOptionsSchema,
})
const verifiedSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("verified"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const mfaSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("mfa"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  mfaMethods: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  options: v.optional(passkeyOptionsSchema),
  webAuthnCheckMethod: v.optional(v.picklist(["u2f", "passkey"])),
})
const mfaTotpSetupSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("mfa_totp_setup"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  mfaMethods: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  enrollmentStartedAt: v.pipe(v.number(), v.integer()),
})
const mfaEmailOtpCodeSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("mfa_email_otp_code"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  mfaMethods: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  enrollmentActivationConsumedAt: v.optional(v.pipe(v.number(), v.integer())),
  challengeIssuedAt: v.optional(v.pipe(v.number(), v.integer())),
})
const mfaSmsOtpCodeSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("mfa_sms_otp_code"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  mfaMethods: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  enrollmentActivationConsumedAt: v.pipe(v.number(), v.integer()),
  challengeIssuedAt: v.optional(v.pipe(v.number(), v.integer())),
})
const mfaWebAuthnSetupSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("mfa_webauthn_setup"),
  delegable: v.literal(false),
  userId: boundedIdSchema,
  sessionId: boundedIdSchema,
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  mfaMethods: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  registrationMethod: v.picklist(["u2f", "passkey"]),
  registrationId: boundedIdSchema,
  registrationChallenge: v.pipe(v.string(), v.minLength(1), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/)),
  registrationRpId: v.pipe(v.string(), v.minLength(1), v.maxLength(253)),
  registrationOrigin: v.pipe(v.string(), v.url(), v.maxLength(2048)),
  registrationStartedAt: v.pipe(v.number(), v.integer()),
  registrationExpiresAt: v.pipe(v.number(), v.integer()),
})
const idpIntentSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("idp_intent"),
  delegable: v.literal(false),
  idpId: boundedIdSchema,
  idpType: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  redirectUrl: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
})
const idpUnlinkedSchema = v.strictObject({
  ...baseSchema,
  stage: v.literal("idp_unlinked"),
  delegable: v.literal(false),
  idpId: boundedIdSchema,
  idpType: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  idpUserId: v.optional(boundedIdSchema),
  idpUserName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(254))),
})

export const flowV2CookieSchema = v.variant("stage", [
  readySchema,
  silentSchema,
  otpSchema,
  otpDecoySchema,
  passkeySchema,
  mfaSchema,
  mfaTotpSetupSchema,
  mfaEmailOtpCodeSchema,
  mfaSmsOtpCodeSchema,
  mfaWebAuthnSetupSchema,
  verifiedSchema,
  idpIntentSchema,
  idpUnlinkedSchema,
])

export type FlowV2Cookie = v.InferOutput<typeof flowV2CookieSchema>
