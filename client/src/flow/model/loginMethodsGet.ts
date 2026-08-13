import type { BootstrapView } from "../../branding/model/bootstrapViewSchema"
import type { LoginMethodSelection } from "./loginMethodSelectionSchema"

export function loginMethodsGet(view: BootstrapView): Array<{
  selection: LoginMethodSelection
  label: string
  detail: string
  identityProviderType?: string
}> {
  const available: Array<{
    selection: LoginMethodSelection
    label: string
    detail: string
    identityProviderType?: string
  }> = []
  if (view.primaryMethods.includes("email_otp")) {
    available.push({ selection: { method: "email_otp" }, label: "Email code", detail: "Receive a one-time code" })
  }
  if (view.primaryMethods.includes("password")) {
    available.push({ selection: { method: "password" }, label: "Password", detail: "Sign in with password" })
  }
  if (view.primaryMethods.includes("passkey")) {
    available.push({
      selection: { method: "passkey" },
      label: "Passkey",
      detail: "Use your fingerprint, face, or device PIN",
    })
  }
  if (view.primaryMethods.includes("identity_provider")) {
    for (const provider of view.identityProviders) {
      available.push({
        selection: { method: "identity_provider", identityProviderId: provider.id },
        label: provider.name,
        detail: `Sign in with ${provider.name}`,
        identityProviderType: provider.type,
      })
    }
  }
  return available
}
