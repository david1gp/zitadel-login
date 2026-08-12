import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import type { MfaMethodSummary } from "../model/mfaMethodSummarySchema"
import type { MfaOptions } from "../model/mfaOptionsSchema"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

type SessionFactors = {
  user?: { id: string; organizationId: string }
  password?: { verifiedAt?: string }
  intent?: { verifiedAt?: string }
  totp?: { verifiedAt?: string }
  otpSms?: { verifiedAt?: string }
  otpEmail?: { verifiedAt?: string }
  webAuthN?: { verifiedAt?: string; userVerified?: boolean }
  [key: string]: unknown
}

const authenticationMethodTypes = new Set([
  "AUTHENTICATION_METHOD_TYPE_IDP",
  "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
  "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
  "AUTHENTICATION_METHOD_TYPE_PASSKEY",
  "AUTHENTICATION_METHOD_TYPE_PASSWORD",
  "AUTHENTICATION_METHOD_TYPE_TOTP",
  "AUTHENTICATION_METHOD_TYPE_U2F",
])
const secondFactorTypes = new Set([
  "SECOND_FACTOR_TYPE_UNSPECIFIED",
  "SECOND_FACTOR_TYPE_OTP",
  "SECOND_FACTOR_TYPE_U2F",
  "SECOND_FACTOR_TYPE_OTP_EMAIL",
  "SECOND_FACTOR_TYPE_OTP_SMS",
])
const multiFactorTypes = new Set(["MULTI_FACTOR_TYPE_UNSPECIFIED", "MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"])
const sessionFactorNames = new Set(["user", "password", "intent", "totp", "otpSms", "otpEmail", "webAuthN"])

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function timestampIsVerified(value: string | undefined): boolean {
  if (!value) return false
  return Number.isFinite(Date.parse(value))
}

function summaryCreate(type: MfaMethodSummary["type"]): MfaMethodSummary {
  return { type }
}

function policyMethodsGet(input: {
  secondFactors: string[]
  multiFactors: string[]
  methods: string[]
  factors: SessionFactors
  emailVerified: boolean
  phoneVerified: boolean
}) {
  const allowed: MfaMethodSummary[] = []
  const enrolled: MfaMethodSummary[] = []
  const methodSet = new Set(input.methods)
  const add = (type: MfaMethodSummary["type"], isEnrolled: boolean) => {
    const summary = summaryCreate(type)
    if (isEnrolled) {
      enrolled.push(summary)
      return
    }
    allowed.push(summary)
  }

  if (input.secondFactors.includes("SECOND_FACTOR_TYPE_OTP")) {
    add("totp", methodSet.has("AUTHENTICATION_METHOD_TYPE_TOTP"))
  }
  if (input.secondFactors.includes("SECOND_FACTOR_TYPE_OTP_EMAIL") && input.emailVerified) {
    const otpEmailWasPrimary =
      timestampIsVerified(input.factors.otpEmail?.verifiedAt) &&
      !timestampIsVerified(input.factors.password?.verifiedAt) &&
      !timestampIsVerified(input.factors.intent?.verifiedAt) &&
      !timestampIsVerified(input.factors.webAuthN?.verifiedAt)
    if (!otpEmailWasPrimary) {
      add("email_otp", methodSet.has("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"))
    }
  }
  if (input.secondFactors.includes("SECOND_FACTOR_TYPE_OTP_SMS") && input.phoneVerified) {
    if (methodSet.has("AUTHENTICATION_METHOD_TYPE_OTP_SMS")) add("sms_otp", true)
  }
  const webAuthNWasPrimary = timestampIsVerified(input.factors.webAuthN?.verifiedAt)
  if (input.secondFactors.includes("SECOND_FACTOR_TYPE_U2F") && !webAuthNWasPrimary) {
    add("u2f", methodSet.has("AUTHENTICATION_METHOD_TYPE_U2F"))
  }
  if (input.multiFactors.includes("MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION") && !webAuthNWasPrimary) {
    add(
      "passkey",
      methodSet.has("AUTHENTICATION_METHOD_TYPE_U2F") || methodSet.has("AUTHENTICATION_METHOD_TYPE_PASSKEY"),
    )
  }

  return { allowed, enrolled }
}

function sessionFactorIsSatisfied(factors: SessionFactors): boolean {
  if (timestampIsVerified(factors.totp?.verifiedAt) || timestampIsVerified(factors.otpSms?.verifiedAt)) return true

  const password = timestampIsVerified(factors.password?.verifiedAt)
  const intent = timestampIsVerified(factors.intent?.verifiedAt)
  const email = timestampIsVerified(factors.otpEmail?.verifiedAt)
  const webAuthN = timestampIsVerified(factors.webAuthN?.verifiedAt)
  if (webAuthN && factors.webAuthN?.userVerified === true) return true
  if (email && (password || intent || webAuthN)) return true
  if (webAuthN && (password || intent || email)) return true
  return false
}

export async function mfaOptionsGet(input: Input) {
  const op = "mfaOptionsGet"
  const session = await input.client.sessionGet(input.state.sessionId, input.state.sessionToken)
  if (!session.success) {
    const status = resultStatusGet(session)
    if (status === 401 || status === 404) return resultErrorCreate(op, "session_stale", { status })
    return resultErrorCreate(op, "mfa_unavailable", { status })
  }

  const nativeSession = session.data.session
  const factors = nativeSession.factors as SessionFactors | undefined
  const expiresAt = nativeSession.expirationDate ? Date.parse(nativeSession.expirationDate) : undefined
  if (
    nativeSession.id !== input.state.sessionId ||
    (expiresAt !== undefined && expiresAt <= input.now * 1000) ||
    factors?.user?.id !== input.state.userId ||
    factors.user.organizationId !== input.state.organizationId
  ) {
    return resultErrorCreate(op, "session_stale")
  }

  const user = await input.client.userGet(input.state.userId)
  if (!user.success) return resultErrorCreate(op, "mfa_unavailable", { status: resultStatusGet(user) })
  if (
    user.data.user.userId !== input.state.userId ||
    user.data.user.state !== "USER_STATE_ACTIVE" ||
    user.data.user.details?.resourceOwner !== input.state.organizationId ||
    !user.data.user.human
  ) {
    return resultErrorCreate(op, "session_stale")
  }

  const methods = await input.client.authenticationMethodsGet(input.state.userId)
  if (!methods.success) return resultErrorCreate(op, "mfa_unavailable", { status: resultStatusGet(methods) })
  const settings = await input.client.loginSettingsGet(input.state.organizationId)
  if (!settings.success) return resultErrorCreate(op, "mfa_unavailable", { status: resultStatusGet(settings) })

  const latestToken = nativeSession.sessionToken ?? input.state.sessionToken
  const state = latestToken === input.state.sessionToken ? input.state : { ...input.state, sessionToken: latestToken }
  const methodTypes = methods.data.authMethodTypes
  const secondFactors = settings.data.settings?.secondFactors ?? []
  const multiFactors = settings.data.settings?.multiFactors ?? []

  if (methodTypes.some((method) => method.includes("RECOVERY"))) {
    return resultCreate({ state, options: { mode: "fallback", reason: "recovery_code" } satisfies MfaOptions })
  }
  if (
    methodTypes.some((method) => !authenticationMethodTypes.has(method)) ||
    new Set(methodTypes).size !== methodTypes.length ||
    secondFactors.some((factor) => !secondFactorTypes.has(factor)) ||
    new Set(secondFactors).size !== secondFactors.length ||
    multiFactors.some((factor) => !multiFactorTypes.has(factor)) ||
    new Set(multiFactors).size !== multiFactors.length ||
    Object.keys(factors).some((factor) => !sessionFactorNames.has(factor))
  ) {
    return resultCreate({ state, options: { mode: "fallback", reason: "unsupported_branch" } satisfies MfaOptions })
  }

  const passwordPrimary = timestampIsVerified(factors.password?.verifiedAt)
  const intentPrimary = timestampIsVerified(factors.intent?.verifiedAt)
  const emailPrimary = timestampIsVerified(factors.otpEmail?.verifiedAt)
  const webAuthNPrimary = timestampIsVerified(factors.webAuthN?.verifiedAt)
  if ((passwordPrimary && intentPrimary) || (!passwordPrimary && !intentPrimary && !emailPrimary && !webAuthNPrimary)) {
    return resultCreate({ state, options: { mode: "fallback", reason: "unsupported_branch" } satisfies MfaOptions })
  }

  if (sessionFactorIsSatisfied(factors)) {
    return resultCreate({
      state,
      options: { mode: "skip", reason: "factor_satisfied", methods: [] } satisfies MfaOptions,
    })
  }

  const policyMethods = policyMethodsGet({
    secondFactors,
    multiFactors,
    methods: methodTypes,
    factors,
    emailVerified: user.data.user.human.email?.isVerified === true,
    phoneVerified: user.data.user.human.phone?.isVerified === true,
  })
  if (policyMethods.enrolled.length === 1) {
    return resultCreate({ state, options: { mode: "check", method: policyMethods.enrolled[0]! } satisfies MfaOptions })
  }
  if (policyMethods.enrolled.length > 1) {
    return resultCreate({ state, options: { mode: "select", methods: policyMethods.enrolled } satisfies MfaOptions })
  }

  const localPrimary = passwordPrimary || emailPrimary || webAuthNPrimary
  const forced =
    settings.data.settings?.forceMfa === true || (settings.data.settings?.forceMfaLocalOnly === true && localPrimary)
  if (forced && policyMethods.allowed.length > 0) {
    return resultCreate({ state, options: { mode: "enroll", methods: policyMethods.allowed } satisfies MfaOptions })
  }
  if (!forced && policyMethods.allowed.length > 0) {
    return resultCreate({
      state,
      options: { mode: "skip", reason: "optional_setup", methods: policyMethods.allowed } satisfies MfaOptions,
    })
  }
  return resultCreate({ state, options: { mode: "fallback", reason: "unsupported_branch" } satisfies MfaOptions })
}
