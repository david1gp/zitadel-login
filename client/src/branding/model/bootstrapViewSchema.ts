import * as v from "valibot"

const colorSchema = v.strictObject({
  background: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
  font: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
  primary: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
  warn: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
})
const themeSchema = v.strictObject({
  colors: colorSchema,
  iconUrl: v.optional(v.pipe(v.string(), v.url())),
  logoUrl: v.optional(v.pipe(v.string(), v.url())),
})

export const bootstrapViewSchema = v.strictObject({
  capabilities: v.strictObject({
    passwordRecovery: v.boolean(),
  }),
  branding: v.strictObject({
    dark: themeSchema,
    disableWatermark: v.boolean(),
    fontUrl: v.optional(v.pipe(v.string(), v.url())),
    light: themeSchema,
    themeMode: v.picklist(["dark", "light", "system"]),
  }),
  identityProviders: v.array(
    v.strictObject({
      id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      type: v.picklist([
        "apple",
        "azure_ad",
        "google",
        "github",
        "github_es",
        "gitlab",
        "gitlab_self_hosted",
        "jwt",
        "ldap",
        "oauth",
        "oidc",
        "saml",
      ]),
    }),
  ),
  organization: v.strictObject({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
  primaryMethods: v.array(v.picklist(["email_otp", "password", "passkey", "identity_provider"])),
  updatedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type BootstrapView = v.InferOutput<typeof bootstrapViewSchema>
