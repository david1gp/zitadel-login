type PrimaryMethod = "email_otp" | "passkey" | "password"

type Input = {
  method: PrimaryMethod
  requestKind: "oidc"
  prompt: string[]
  loginHint?: string
  maxAgeSeconds?: number
  organizationId: string
  identifier: string
  mfaV2Enabled: boolean
  forceMfa: boolean
  forceMfaLocalOnly: boolean
  now: number
  passwordMaxAgeDays?: number
  methods: string[]
  user: {
    userId: string
    state: string
    preferredLoginName?: string
    details?: { resourceOwner?: string }
    human?: {
      passwordChangeRequired?: boolean
      passwordChanged?: string
      email?: { email: string; isVerified: boolean }
      phone?: { phone: string; isVerified?: boolean }
    }
  }
}

const supportedPrompts = new Set(["PROMPT_UNSPECIFIED", "PROMPT_LOGIN", "PROMPT_SELECT_ACCOUNT"])
const supportedMethods = new Set([
  "AUTHENTICATION_METHOD_TYPE_IDP",
  "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
  "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
  "AUTHENTICATION_METHOD_TYPE_PASSKEY",
  "AUTHENTICATION_METHOD_TYPE_PASSWORD",
  "AUTHENTICATION_METHOD_TYPE_TOTP",
  "AUTHENTICATION_METHOD_TYPE_U2F",
])
const mfaMethods = new Set([
  "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
  "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
  "AUTHENTICATION_METHOD_TYPE_TOTP",
  "AUTHENTICATION_METHOD_TYPE_U2F",
])

function loginHintMatches(input: Input): boolean {
  if (!input.loginHint) return true
  const expected = input.loginHint.trim().toLowerCase()
  if (!expected) return true
  const candidates = [
    input.identifier,
    input.user.preferredLoginName,
    input.user.human?.email?.email,
    input.user.human?.phone?.phone,
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
  return candidates.some((value) => value.trim().toLowerCase() === expected)
}

function passwordLifecycleIsSupported(input: Input): boolean {
  if (input.method !== "password" || !input.passwordMaxAgeDays || !input.user.human?.passwordChanged) return true
  const changedAt = Date.parse(input.user.human.passwordChanged)
  return Number.isFinite(changedAt)
}

export function primaryFlowOwnershipPreflight(input: Input): boolean {
  if (input.requestKind !== "oidc") return false
  if (new Set(input.prompt).size !== input.prompt.length) return false
  if (input.prompt.some((prompt) => !supportedPrompts.has(prompt))) return false
  if (input.maxAgeSeconds !== undefined && (!Number.isInteger(input.maxAgeSeconds) || input.maxAgeSeconds < 0)) {
    return false
  }
  if (input.user.state !== "USER_STATE_ACTIVE") return false
  if (input.user.details?.resourceOwner !== input.organizationId) return false
  if (!input.user.human) return false
  if (!loginHintMatches(input)) return false
  if (input.methods.some((method) => !supportedMethods.has(method))) return false

  const primaryMethod = {
    email_otp: "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
    passkey: "AUTHENTICATION_METHOD_TYPE_PASSKEY",
    password: "AUTHENTICATION_METHOD_TYPE_PASSWORD",
  }[input.method]
  if (!input.methods.includes(primaryMethod)) return false
  if (input.method === "email_otp" && input.user.human.email?.isVerified !== true) return false
  if (!passwordLifecycleIsSupported(input)) return false

  const enrolledMfa = input.methods.some(
    (method) => mfaMethods.has(method) && !(input.method === "email_otp" && method === primaryMethod),
  )
  const policyMayRequireMfa = input.forceMfa || (input.method === "password" && input.forceMfaLocalOnly)
  return input.mfaV2Enabled || (!enrolledMfa && !policyMayRequireMfa)
}
