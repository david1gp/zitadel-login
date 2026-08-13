import { describe, expect, test } from "bun:test"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: "https://identity.example",
  ZITADEL_ORGANIZATION_ID: "org-contentoren",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-1",
  LOGIN_V2_FALLBACK_URL: "https://identity.example/ui/v2/login",
  PAGES_ORIGIN: "https://login.example",
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ZITADEL_LOGIN_V2_ENABLED: "true",
  ZITADEL_EMAIL_OTP_V2_ENABLED: "true",
  ZITADEL_PASSWORD_V2_ENABLED: "true",
  ZITADEL_PASSWORD_RESET_V2_ENABLED: "true",
  ZITADEL_PASSKEY_V2_ENABLED: "true",
  ZITADEL_IDP_V2_ENABLED: "true",
  ZITADEL_MFA_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

const authRequest = {
  id: "request-1",
  clientId: "client-1",
  redirectUri: "https://client.example/callback",
  scope: ["openid", "urn:zitadel:iam:org:id:org-contentoren"],
  prompt: ["PROMPT_LOGIN"],
}

const defaultOrganization = {
  result: [{ id: "org-contentoren", name: "Contentoren", state: "ORGANIZATION_STATE_ACTIVE" }],
}

const brandingSettings = {
  settings: {
    themeMode: "THEME_MODE_AUTO",
    disableWatermark: true,
    fontUrl: "https://identity.example/assets/font",
    lightTheme: {
      logoUrl: "https://identity.example/assets/logo-light",
      iconUrl: "https://identity.example/assets/icon-light",
      primaryColor: "#112233",
      backgroundColor: "#fefefe",
      warnColor: "#aa0000",
      fontColor: "#101010",
    },
    darkTheme: {
      logoUrl: "https://identity.example/assets/logo-dark",
      iconUrl: "https://identity.example/assets/icon-dark",
      primaryColor: "#ddeeff",
      backgroundColor: "#111111",
      warnColor: "#ff0000",
      fontColor: "#fefefe",
    },
  },
}

const loginSettings = {
  settings: {
    allowLocalAuthentication: true,
    allowExternalIdp: true,
    passkeysType: "PASSKEYS_TYPE_ALLOWED",
  },
}

const identityProviders = {
  identityProviders: [
    { id: "google-1", name: "Google", type: "IDENTITY_PROVIDER_TYPE_GOOGLE", config: { clientId: "private" } },
    { id: "github-1", name: "GitHub", type: "IDENTITY_PROVIDER_TYPE_GITHUB", options: { isCreationAllowed: true } },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function requestUrl(input: RequestInfo | URL): string {
  return String(input)
}

function headersAssert(init: RequestInit | undefined, organization?: string): void {
  const headers = new Headers(init?.headers)
  expect(headers.get("authorization")).toBe(`Bearer ${bindings.ZITADEL_LOGIN_CLIENT_PAT}`)
  if (organization) expect(headers.get("x-zitadel-orgid")).toBe(organization)
}

function bootstrapRequest(updatedAt?: number): Request {
  const query = updatedAt === undefined ? "" : `&updatedAt=${updatedAt}`
  return new Request(`https://worker.example/api/v2/bootstrap?authRequest=request-1${query}`, {
    headers: { origin: bindings.PAGES_ORIGIN },
  })
}

describe("v2 bootstrap contract", () => {
  test("rejects an auth request scoped to another organization before public settings calls", async () => {
    let calls = 0
    const app = workerAppCreate({
      fetch: async () => {
        calls += 1
        return jsonResponse({ authRequest: { ...authRequest, scope: ["openid", "urn:zitadel:iam:org:id:other"] } })
      },
    })

    const response = await app.fetch(bootstrapRequest(), bindings)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "bootstrap",
      errorMessage: "Bootstrap is temporarily unavailable.",
    })
    expect(calls).toBe(1)
  })

  test("projects inherited branding, methods, and providers through exact native calls", async () => {
    const calls: string[] = []
    const app = workerAppCreate({
      fetch: async (input, init) => {
        const url = requestUrl(input)
        calls.push(url)
        headersAssert(init)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            queries: [{ idQuery: { id: bindings.ZITADEL_ORGANIZATION_ID } }],
          })
          return jsonResponse(defaultOrganization)
        }
        if (url.endsWith("/v2/settings/branding")) {
          headersAssert(init, bindings.ZITADEL_ORGANIZATION_ID)
          return jsonResponse(brandingSettings)
        }
        if (url.endsWith("/v2/settings/login")) {
          headersAssert(init, bindings.ZITADEL_ORGANIZATION_ID)
          return jsonResponse(loginSettings)
        }
        if (url.endsWith("/v2/settings/login/idps")) {
          headersAssert(init, bindings.ZITADEL_ORGANIZATION_ID)
          return jsonResponse(identityProviders)
        }
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), bindings)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        capabilities: { passwordRecovery: true },
        branding: {
          dark: {
            colors: { background: "#111111", font: "#fefefe", primary: "#ddeeff", warn: "#ff0000" },
            iconUrl: "https://identity.example/assets/icon-dark",
            logoUrl: "https://identity.example/assets/logo-dark",
          },
          disableWatermark: true,
          fontUrl: "https://identity.example/assets/font",
          light: {
            colors: { background: "#fefefe", font: "#101010", primary: "#112233", warn: "#aa0000" },
            iconUrl: "https://identity.example/assets/icon-light",
            logoUrl: "https://identity.example/assets/logo-light",
          },
          themeMode: "system",
        },
        identityProviders: [
          { id: "google-1", name: "Google", type: "google" },
          { id: "github-1", name: "GitHub", type: "github" },
        ],
        organization: { id: "org-contentoren", name: "Contentoren" },
        primaryMethods: ["email_otp", "password", "passkey", "identity_provider"],
        updatedAt: 1_800_000_000,
      },
    })
    expect(calls).toContain("https://identity.example/v2/settings/branding")
    expect(calls).toContain("https://identity.example/v2/settings/login")
    expect(calls).toContain("https://identity.example/v2/settings/login/idps")
  })

  test("rejects an organization response that does not match the configured ID", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search"))
          return jsonResponse({
            result: [{ id: "org-instance-default", name: "Instance Default", state: "ORGANIZATION_STATE_ACTIVE" }],
          })
        throw new Error(`Unexpected native call: ${url}`)
      },
      logger: { warn: () => undefined, error: () => undefined },
    })

    const response = await app.fetch(bootstrapRequest(), bindings)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "bootstrap",
      errorMessage: "Bootstrap is temporarily unavailable.",
    })
  })

  test("rejects a configured organization without an explicit active state before public settings calls", async () => {
    let settingsCalls = 0
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search"))
          return jsonResponse({
            result: [{ id: bindings.ZITADEL_ORGANIZATION_ID, name: "Contentoren" }],
          })
        settingsCalls += 1
        throw new Error(`Unexpected public settings call: ${url}`)
      },
      logger: { warn: () => undefined, error: () => undefined },
    })

    const response = await app.fetch(bootstrapRequest(), bindings)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      op: "bootstrap",
      errorMessage: "Bootstrap is temporarily unavailable.",
    })
    expect(settingsCalls).toBe(0)
  })

  test("uses the bounded cache and returns null for an unchanged public projection", async () => {
    let calls = 0
    const app = workerAppCreate({
      fetch: async (input) => {
        calls += 1
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) return jsonResponse(loginSettings)
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const first = await app.fetch(bootstrapRequest(), bindings)
    const second = await app.fetch(bootstrapRequest(1_800_000_000), bindings)

    expect(first.status).toBe(200)
    expect(await second.json()).toEqual({ success: true, data: null })
    expect(calls).toBe(6)
  })

  test("fails closed on malformed upstream branding without returning upstream data", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding"))
          return jsonResponse({ settings: { lightTheme: { primaryColor: 42 } } })
        if (url.endsWith("/v2/settings/login")) return jsonResponse(loginSettings)
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      logger: { warn: () => undefined, error: () => undefined },
    })

    const response = await app.fetch(bootstrapRequest(), bindings)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      success: false,
      op: "bootstrap",
      errorMessage: "Bootstrap is temporarily unavailable.",
    })
  })

  test("returns no native secret or provider configuration fields", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) return jsonResponse(loginSettings)
        if (url.endsWith("/v2/settings/login/idps"))
          return jsonResponse({
            identityProviders: [
              {
                ...identityProviders.identityProviders[0],
                config: { clientSecret: "must-not-leak", tokenEndpoint: "https://private.example/token" },
              },
            ],
          })
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), bindings)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).not.toContain(bindings.ZITADEL_LOGIN_CLIENT_PAT)
    expect(body).not.toContain("clientSecret")
    expect(body).not.toContain("tokenEndpoint")
  })

  test("omits disabled methods from primaryMethods when capability gates are off", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) return jsonResponse(loginSettings)
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const customBindings: WorkerBindingsInput = {
      ...bindings,
      ZITADEL_PASSWORD_V2_ENABLED: "false",
      ZITADEL_PASSKEY_V2_ENABLED: "false",
    }

    const response = await app.fetch(bootstrapRequest(), customBindings)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        capabilities: { passwordRecovery: true },
        branding: expect.any(Object),
        identityProviders: [
          { id: "google-1", name: "Google", type: "google" },
          { id: "github-1", name: "GitHub", type: "github" },
        ],
        organization: { id: "org-contentoren", name: "Contentoren" },
        primaryMethods: ["email_otp", "identity_provider"],
        updatedAt: 1_800_000_000,
      },
    })
  })

  test("hides password recovery when the independent reset gate is off", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) return jsonResponse(loginSettings)
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), {
      ...bindings,
      ZITADEL_PASSWORD_RESET_V2_ENABLED: "false",
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.capabilities).toEqual({ passwordRecovery: false })
  })

  test("hides password recovery when native login settings disable reset", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) {
          return jsonResponse({ settings: { ...loginSettings.settings, hidePasswordReset: true } })
        }
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), bindings)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.capabilities).toEqual({ passwordRecovery: false })
  })

  test("hides password recovery when native local authentication is disabled", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) {
          return jsonResponse({ settings: { ...loginSettings.settings, allowLocalAuthentication: false } })
        }
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), bindings)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.capabilities).toEqual({ passwordRecovery: false })
  })

  test("does not advertise IdPs or forced unowned MFA branches when the MFA gate is off", async () => {
    const app = workerAppCreate({
      fetch: async (input) => {
        const url = requestUrl(input)
        if (url.endsWith(`/v2/oidc/auth_requests/${authRequest.id}`)) return jsonResponse({ authRequest })
        if (url.endsWith("/v2/organizations/_search")) return jsonResponse(defaultOrganization)
        if (url.endsWith("/v2/settings/branding")) return jsonResponse(brandingSettings)
        if (url.endsWith("/v2/settings/login")) {
          return jsonResponse({
            settings: { ...loginSettings.settings, forceMfa: true, forceMfaLocalOnly: true },
          })
        }
        if (url.endsWith("/v2/settings/login/idps")) return jsonResponse(identityProviders)
        throw new Error(`Unexpected native call: ${url}`)
      },
      now: () => 1_800_000_000,
    })

    const response = await app.fetch(bootstrapRequest(), {
      ...bindings,
      ZITADEL_MFA_V2_ENABLED: "false",
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.primaryMethods).toEqual([])
    expect(body.data.identityProviders).toEqual([])
  })
})
