import * as v from "valibot"

import type { Result } from "../result/Result"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import { zitadelClientCreate } from "../zitadel/zitadelClientCreate"
import { bootstrapCacheCreate } from "./bootstrapCacheCreate"
import { type BootstrapView, bootstrapViewSchema } from "./bootstrapViewSchema"

type Client = ReturnType<typeof zitadelClientCreate>
type Branding = BootstrapView["branding"]
type LiveSettings = Pick<BootstrapView, "capabilities" | "identityProviders" | "primaryMethods">
type Legal = NonNullable<BootstrapView["legal"]>
type CachedProjection<T> = { data: T; updatedAt: number }

const brandingCacheLifetimeSeconds = 600
const liveSettingsCacheLifetimeSeconds = 60

type BootstrapViewGetInput = {
  brandingCache: ReturnType<typeof bootstrapCacheCreate<CachedProjection<Branding>>>
  brandingCacheKey: string
  client: Client
  customLoginEnabled: boolean
  liveSettingsCache: ReturnType<typeof bootstrapCacheCreate<CachedProjection<LiveSettings>>>
  liveSettingsCacheKey: string
  legal?: Legal
  now: number
  origin: string
  organization: {
    id: string
    name: string
  }
  capabilities?: {
    passwordResetV2?: boolean
  }
}

const fallbackColors = {
  dark: { background: "#252526", font: "#ffffff", primary: "#eeeeee", warn: "#ff3b5b" },
  light: { background: "#fafafa", font: "#000000", primary: "#5469d4", warn: "#cd3d56" },
}

const themeModeGet = (value: string | undefined): BootstrapView["branding"]["themeMode"] => {
  if (value === "THEME_MODE_DARK") return "dark"
  if (value === "THEME_MODE_LIGHT") return "light"
  return "system"
}

const idpTypeGet = (value: string): BootstrapView["identityProviders"][number]["type"] | undefined => {
  const prefix = "IDENTITY_PROVIDER_TYPE_"
  if (!value.startsWith(prefix)) return undefined
  const type = value.slice(prefix.length).toLowerCase()
  if (type === "azure_ad" || type === "github_es" || type === "gitlab_self_hosted") return type
  if (["apple", "github", "gitlab", "google", "jwt", "ldap", "oauth", "oidc", "saml"].includes(type))
    return type as BootstrapView["identityProviders"][number]["type"]
  return undefined
}

function assetUrlGet(value: string | undefined, origin: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
    )
      return undefined
    if (url.username || url.password) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function colorGet(value: string | undefined, fallback: string): string {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback
}

function themeGet(
  theme:
    | {
        backgroundColor?: string
        fontColor?: string
        iconUrl?: string
        logoUrl?: string
        primaryColor?: string
        warnColor?: string
      }
    | undefined,
  fallback: (typeof fallbackColors)["light"],
  origin: string,
) {
  return {
    colors: {
      background: colorGet(theme?.backgroundColor, fallback.background),
      font: colorGet(theme?.fontColor, fallback.font),
      primary: colorGet(theme?.primaryColor, fallback.primary),
      warn: colorGet(theme?.warnColor, fallback.warn),
    },
    ...(assetUrlGet(theme?.iconUrl, origin) ? { iconUrl: assetUrlGet(theme?.iconUrl, origin) } : {}),
    ...(assetUrlGet(theme?.logoUrl, origin) ? { logoUrl: assetUrlGet(theme?.logoUrl, origin) } : {}),
  }
}

export async function bootstrapViewGet(input: BootstrapViewGetInput): Promise<Result<BootstrapView>> {
  const op = "bootstrapViewGet"
  const brandingCached = input.brandingCache.get(input.brandingCacheKey, input.now)
  const liveSettingsCached = input.liveSettingsCache.get(input.liveSettingsCacheKey, input.now)
  const [branding, liveSettings] = await Promise.all([
    brandingCached
      ? Promise.resolve(resultCreate(brandingCached))
      : input.client.brandingSettingsGet(input.organization.id).then((result) => {
          if (!result.success) return result
          const settings = result.data.settings
          const light = themeGet(settings?.lightTheme, fallbackColors.light, input.origin)
          const dark = themeGet(settings?.darkTheme, fallbackColors.dark, input.origin)
          const projected = {
            data: {
              dark,
              disableWatermark: settings?.disableWatermark === true,
              ...(assetUrlGet(settings?.fontUrl, input.origin)
                ? { fontUrl: assetUrlGet(settings?.fontUrl, input.origin) }
                : {}),
              light,
              themeMode: themeModeGet(settings?.themeMode),
            },
            updatedAt: input.now,
          }
          const parsed = v.safeParse(bootstrapViewSchema.entries.branding, projected.data)
          if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))
          input.brandingCache.set(
            input.brandingCacheKey,
            { data: parsed.output, updatedAt: projected.updatedAt },
            input.now + brandingCacheLifetimeSeconds,
          )
          return resultCreate({ data: parsed.output, updatedAt: projected.updatedAt })
        }),
    liveSettingsCached
      ? Promise.resolve(resultCreate(liveSettingsCached))
      : Promise.all([
          input.client.loginSettingsGet(input.organization.id),
          input.client.activeIdentityProvidersGet(input.organization.id),
        ]).then(([loginSettings, identityProviders]) => {
          if (!loginSettings.success || !identityProviders.success)
            return resultErrorCreate(op, "Bootstrap settings are unavailable")

          const login = loginSettings.data.settings
          const providers = identityProviders.data.identityProviders
            .map((provider) => {
              const type = idpTypeGet(provider.type)
              if (!type) return undefined
              return { id: provider.id, name: provider.name, type }
            })
            .filter((provider): provider is NonNullable<typeof provider> => provider !== undefined)

          const primaryMethods: BootstrapView["primaryMethods"] = []
          if (input.customLoginEnabled) {
            if (login?.allowLocalAuthentication === true) {
              primaryMethods.push("email_otp")
              primaryMethods.push("password")
              if (login.passkeysType === "PASSKEYS_TYPE_ALLOWED") primaryMethods.push("passkey")
            }
            if (login?.allowExternalIdp === true && providers.length > 0) primaryMethods.push("identity_provider")
          }
          const projected = {
            data: {
              capabilities: {
                passwordRecovery:
                  (input.capabilities?.passwordResetV2 ?? false) &&
                  login?.allowLocalAuthentication === true &&
                  login.hidePasswordReset !== true,
              },
              identityProviders: input.customLoginEnabled && login?.allowExternalIdp === true ? providers : [],
              primaryMethods,
            },
            updatedAt: input.now,
          }
          input.liveSettingsCache.set(
            input.liveSettingsCacheKey,
            projected,
            input.now + liveSettingsCacheLifetimeSeconds,
          )
          return resultCreate(projected)
        }),
  ])
  if (!branding.success || !liveSettings.success) {
    return resultErrorCreate(op, "Bootstrap settings are unavailable")
  }

  const view = {
    ...liveSettings.data.data,
    branding: branding.data.data,
    ...(input.legal ? { legal: input.legal } : {}),
    organization: input.organization,
    updatedAt: Math.max(branding.data.updatedAt, liveSettings.data.updatedAt),
  }
  const parsed = v.safeParse(bootstrapViewSchema, view)
  if (!parsed.success) return resultErrorCreate(op, "Bootstrap data is invalid")
  return resultCreate(parsed.output)
}
