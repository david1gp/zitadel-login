import type { LoginMethodSelection } from "./loginMethodSelectionSchema"
import { loginQueryFilter } from "./loginQueryFilter"

export function loginRoutePathGet(selection: LoginMethodSelection | undefined, search = ""): string {
  const query = loginQueryFilter(search)
  if (!selection) return `/login${query}`
  if (selection.method === "email_otp") return `/login/email-otp${query}`
  if (selection.method === "password") return `/login/password${query}`
  if (selection.method === "passkey") return `/login/passkey${query}`
  if (selection.method === "mfa") {
    if (selection.factor) {
      const slug =
        selection.factor === "email_otp" ? "email-otp" : selection.factor === "sms_otp" ? "sms-otp" : selection.factor
      return `/login/mfa/${slug}${query}`
    }
    return `/login/mfa${query}`
  }
  const sub = selection.subroute ? `/${selection.subroute}` : ""
  return `/login/idp/${encodeURIComponent(selection.identityProviderId)}${sub}${query}`
}
