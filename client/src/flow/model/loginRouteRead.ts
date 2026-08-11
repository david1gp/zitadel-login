import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { LoginMethodSelection } from "./loginMethodSelectionSchema"

export function loginRouteRead(pathname: string) {
  const op = "loginRouteRead"
  if (pathname === "/" || pathname === "/login" || pathname === "/login/")
    return resultCreate<LoginMethodSelection | undefined>(undefined)
  if (pathname === "/login/email-otp") return resultCreate<LoginMethodSelection>({ method: "email_otp" })
  if (pathname === "/login/password") return resultCreate<LoginMethodSelection>({ method: "password" })
  if (pathname === "/login/passkey") return resultCreate<LoginMethodSelection>({ method: "passkey" })
  if (pathname === "/login/mfa" || pathname === "/login/mfa/")
    return resultCreate<LoginMethodSelection>({ method: "mfa" })
  const mfaMatch = pathname.match(/^\/login\/mfa\/(totp|email-otp|sms-otp|u2f|passkey)$/)
  if (mfaMatch?.[1]) {
    const slug = mfaMatch[1]
    const factor =
      slug === "email-otp" ? "email_otp" : slug === "sms-otp" ? "sms_otp" : (slug as "totp" | "u2f" | "passkey")
    return resultCreate<LoginMethodSelection>({ method: "mfa", factor })
  }
  const match = pathname.match(
    /^\/login\/idp\/([^/]+)(?:\/(failure|account-not-found|linking-failed|registration-failed))?$/,
  )
  if (!match?.[1]) return resultErrorCreate(op, "This sign-in method is not available.")
  let identityProviderId: string
  try {
    identityProviderId = decodeURIComponent(match[1])
  } catch (error) {
    return resultErrorCreate(op, "This sign-in method is not available.", error)
  }
  if (!identityProviderId || identityProviderId.length > 200)
    return resultErrorCreate(op, "This sign-in method is not available.")
  const subroute = match[2] as "failure" | "account-not-found" | "linking-failed" | "registration-failed" | undefined
  return resultCreate<LoginMethodSelection>({
    method: "identity_provider",
    identityProviderId,
    ...(subroute ? { subroute } : {}),
  })
}
