import type { BootstrapView } from "../../branding/model/bootstrapViewSchema"
import { fallbackBootstrap } from "../../branding/model/fallbackBootstrap"

export const demoBootstrap: BootstrapView = {
  capabilities: { passwordRecovery: true },
  branding: fallbackBootstrap.branding,
  identityProviders: [
    { id: "google", name: "Google", type: "google" },
    { id: "github", name: "GitHub", type: "github" },
    { id: "microsoft", name: "Microsoft", type: "azure_ad" },
  ],
  legal: {
    privacyPolicyUrl: "https://example.com/privacy",
    termsOfServiceUrl: "https://example.com/terms",
  },
  organization: { id: "demo", name: "Demo Org" },
  primaryMethods: ["email_otp", "password", "passkey", "identity_provider"],
  updatedAt: 0,
}
