import type { BootstrapView } from "./bootstrapViewSchema"

export const fallbackBootstrap: BootstrapView = {
  branding: {
    dark: { colors: { background: "#17191c", font: "#f4f5f5", primary: "#d7f06c", warn: "#ff756f" } },
    disableWatermark: true,
    light: { colors: { background: "#f5f3ed", font: "#15201d", primary: "#1d5c4b", warn: "#a9362b" } },
    themeMode: "system",
  },
  identityProviders: [],
  organization: { id: "default", name: "Contentoren" },
  primaryMethods: ["email_otp"],
  updatedAt: 0,
}
