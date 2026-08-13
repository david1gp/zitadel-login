type PrimaryMethod = "email_otp" | "passkey" | "password" | "identity_provider"

type Input = {
  method: PrimaryMethod
  methods: string[]
  emailVerified: boolean
  phoneVerified: boolean
  userVerified?: boolean
  policy: {
    forceMfa?: boolean
    forceMfaLocalOnly?: boolean
    secondFactors?: string[]
    multiFactors?: string[]
  }
}

type Output = {
  supported: boolean
  required: boolean
  methods: string[]
}

const supportedSecondFactors = new Set([
  "SECOND_FACTOR_TYPE_UNSPECIFIED",
  "SECOND_FACTOR_TYPE_OTP",
  "SECOND_FACTOR_TYPE_U2F",
  "SECOND_FACTOR_TYPE_OTP_EMAIL",
  "SECOND_FACTOR_TYPE_OTP_SMS",
])
const supportedMultiFactors = new Set(["MULTI_FACTOR_TYPE_UNSPECIFIED", "MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"])
const enrolledMfaMethods = new Set([
  "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
  "AUTHENTICATION_METHOD_TYPE_OTP_SMS",
  "AUTHENTICATION_METHOD_TYPE_PASSKEY",
  "AUTHENTICATION_METHOD_TYPE_TOTP",
  "AUTHENTICATION_METHOD_TYPE_U2F",
])

function valuesAreSupported(values: string[], supported: Set<string>): boolean {
  return new Set(values).size === values.length && values.every((value) => supported.has(value))
}

export function primaryFlowMfaPolicyEvaluate(input: Input): Output {
  const secondFactors = input.policy.secondFactors ?? []
  const multiFactors = input.policy.multiFactors ?? []
  if (!valuesAreSupported(secondFactors, supportedSecondFactors)) {
    return { supported: false, required: false, methods: [] }
  }
  if (!valuesAreSupported(multiFactors, supportedMultiFactors)) {
    return { supported: false, required: false, methods: [] }
  }

  const methods = new Set(input.methods)
  const available = new Set<string>()
  const enrolled = new Set<string>()
  const add = (method: string, canEnroll: boolean) => {
    if (methods.has(method)) enrolled.add(method)
    if (methods.has(method) || canEnroll) available.add(method)
  }

  if (secondFactors.includes("SECOND_FACTOR_TYPE_OTP")) {
    add("AUTHENTICATION_METHOD_TYPE_TOTP", true)
  }
  if (secondFactors.includes("SECOND_FACTOR_TYPE_OTP_EMAIL") && input.emailVerified && input.method !== "email_otp") {
    add("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL", true)
  }
  if (secondFactors.includes("SECOND_FACTOR_TYPE_OTP_SMS") && input.phoneVerified) {
    add("AUTHENTICATION_METHOD_TYPE_OTP_SMS", false)
  }
  if (secondFactors.includes("SECOND_FACTOR_TYPE_U2F")) {
    add("AUTHENTICATION_METHOD_TYPE_U2F", true)
  }
  if (multiFactors.includes("MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION")) {
    if (methods.has("AUTHENTICATION_METHOD_TYPE_PASSKEY")) enrolled.add("AUTHENTICATION_METHOD_TYPE_PASSKEY")
    if (methods.has("AUTHENTICATION_METHOD_TYPE_U2F") || methods.has("AUTHENTICATION_METHOD_TYPE_PASSKEY"))
      available.add("AUTHENTICATION_METHOD_TYPE_U2F")
  }

  const localPrimary = input.method !== "identity_provider"
  const forced = input.policy.forceMfa === true || (localPrimary && input.policy.forceMfaLocalOnly === true)
  const primarySatisfiesMfa = input.method === "passkey" && input.userVerified === true
  if (forced && !primarySatisfiesMfa && available.size === 0) {
    return { supported: false, required: false, methods: [] }
  }

  const methodsForContinuation = [...enrolled].filter((method) => enrolledMfaMethods.has(method))
  const required = !primarySatisfiesMfa && (forced || methodsForContinuation.length > 0)
  return { supported: true, required, methods: methodsForContinuation }
}
