import * as v from "valibot"

const readySchema = v.strictObject({
  status: v.literal("ready"),
  csrfToken: v.string(),
  loginHint: v.optional(v.string()),
  uiLocales: v.optional(v.array(v.string())),
})
const codeSentSchema = v.strictObject({ status: v.literal("code_sent") })
const fallbackSchema = v.strictObject({ status: v.literal("fallback"), fallbackUrl: v.string() })
const continuationSchema = v.strictObject({
  status: v.union([v.literal("continue"), v.literal("verified")]),
  continuationUrl: v.string(),
})
const errorSchema = v.strictObject({
  error: v.strictObject({ code: v.string(), message: v.string() }),
})
const responseSchema = v.union([readySchema, codeSentSchema, fallbackSchema, continuationSchema])

type LoginApiOperation =
  | { type: "initialize"; authRequest: string }
  | { type: "start"; email: string; csrfToken: string }
  | { type: "resend"; csrfToken: string }
  | { type: "verify"; code: string; csrfToken: string }

function endpointGet(operation: LoginApiOperation): string {
  if (operation.type === "initialize") {
    return `/api/auth-request?${new URLSearchParams({ authRequest: operation.authRequest })}`
  }
  return `/api/email-otp/${operation.type}`
}

export async function loginApiRequest(apiOrigin: string, operation: LoginApiOperation) {
  const op = "loginApiRequest"
  const init: RequestInit = { credentials: "include" }
  if (operation.type !== "initialize") {
    init.method = "POST"
    init.headers = { "Content-Type": "application/json" }
    const { type: _, ...payload } = operation
    init.body = JSON.stringify(payload)
  }

  let response: Response
  try {
    response = await fetch(new URL(endpointGet(operation), apiOrigin || window.location.origin), init)
  } catch {
    return { success: false as const, op, errorMessage: "Sign-in is temporarily unavailable. Please try again." }
  }

  let input: unknown
  try {
    input = await response.json()
  } catch {
    return { success: false as const, op, errorMessage: "The sign-in service returned an invalid response." }
  }

  if (!response.ok) {
    const error = v.safeParse(errorSchema, input)
    return {
      success: false as const,
      op,
      errorMessage: error.success ? error.output.error.message : "Sign-in could not be completed.",
      status: response.status,
    }
  }

  const parsed = v.safeParse(responseSchema, input)
  if (!parsed.success) {
    return { success: false as const, op, errorMessage: "The sign-in service returned an invalid response." }
  }
  return { success: true as const, data: parsed.output }
}
