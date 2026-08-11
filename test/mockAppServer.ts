import { existsSync } from "node:fs"
import { join } from "node:path"

import type { WorkerBindingsInput } from "../src/config/workerBindingsSchema"
import { workerAppCreate } from "../src/worker/workerAppCreate"

const port = 3000
const pagesOrigin = `http://localhost:${port}`
const identityOrigin = "https://identity.invalid.test"

const bindings: WorkerBindingsInput = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-test",
  ZITADEL_ALLOWED_CLIENT_IDS: "client-test",
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: pagesOrigin,
  SESSION_LIFETIME_SECONDS: "900",
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-value-1234567890",
  FLOW_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ZITADEL_LOGIN_V2_ENABLED: "true",
  ZITADEL_EMAIL_OTP_V2_ENABLED: "true",
  ZITADEL_PASSWORD_V2_ENABLED: "true",
  ZITADEL_PASSKEY_V2_ENABLED: "true",
  ZITADEL_IDP_V2_ENABLED: "true",
  ZITADEL_MFA_V2_ENABLED: "true",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
}

let sessionToken = "token-created"

const mockZitadelFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? "GET"
  const body = init?.body ? JSON.parse(String(init.body)) : undefined

  if (url.includes("/v2/oidc/auth_requests/test-req-1")) {
    if (method === "POST") {
      return Response.json({ callbackUrl: "https://application.invalid.test/callback?code=v2code&state=v2state" })
    }
    return Response.json({
      authRequest: {
        id: "test-req-1",
        clientId: "client-test",
        redirectUri: "https://application.invalid.test/callback",
        scope: ["openid", "urn:zitadel:iam:org:id:org-test"],
        prompt: ["PROMPT_LOGIN"],
        uiLocales: ["en"],
        loginHint: "",
      },
    })
  }
  if (url.includes("/v2/organizations/_search")) {
    return Response.json({
      result: [{ id: "org-test", name: "Contentoren", state: "ORGANIZATION_STATE_ACTIVE" }],
    })
  }
  if (url.includes("/v2/settings/branding")) {
    return Response.json({
      settings: {
        disableWatermark: true,
        themeMode: "THEME_MODE_UNSPECIFIED",
        lightTheme: { primaryColor: "#1d5c4b", fontColor: "#15201d", backgroundColor: "#f5f3ed" },
        darkTheme: { primaryColor: "#d7f06c", fontColor: "#f4f5f5", backgroundColor: "#17191c" },
      },
    })
  }
  if (url.includes("/v2/idp_intents/intent-unlinked")) {
    return Response.json({
      idpInformation: { idpId: "google", userId: "g-unlinked-123" },
    })
  }
  if (url.includes("/v2/idp_intents") && method === "POST") {
    if (body?.idpId === "github") {
      return Response.json({
        authUrl: "https://github.com/login/oauth/authorize?client_id=github-mock",
      })
    }
    return Response.json({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-mock",
    })
  }
  if (url.includes("/v2/settings/login/idps")) {
    return Response.json({
      identityProviders: [
        { id: "google", name: "Google", type: "IDENTITY_PROVIDER_TYPE_GOOGLE" },
        { id: "github", name: "GitHub", type: "IDENTITY_PROVIDER_TYPE_GITHUB" },
      ],
    })
  }
  if (url.includes("/v2/settings/login")) {
    return Response.json({
      settings: {
        allowLocalAuthentication: true,
        passkeysType: "PASSKEYS_TYPE_ALLOWED",
        allowExternalIdp: true,
        ignoreUnknownUsernames: false,
      },
    })
  }
  if (url.includes("/v2/users") && method === "POST") {
    return Response.json({
      result: [
        {
          userId: "user-v2",
          state: "USER_STATE_ACTIVE",
          details: { resourceOwner: "org-test" },
          human: { email: { email: "person@example.com", isVerified: true } },
        },
      ],
    })
  }
  if (url.includes("/v2/users/user-v2/authentication_methods")) {
    return Response.json({
      authMethodTypes: [
        "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL",
        "AUTHENTICATION_METHOD_TYPE_PASSWORD",
        "AUTHENTICATION_METHOD_TYPE_PASSKEY",
      ],
    })
  }
  if (url.endsWith("/v2/sessions") && method === "POST") {
    if (body?.checks?.password?.password === "wrong-password") {
      return Response.json({ id: "COMMAND-3M0fs" }, { status: 400 })
    }
    sessionToken = "token-created"
    return Response.json(
      {
        sessionId: "session-v2",
        sessionToken,
        challenges: {
          webAuthN: {
            publicKeyCredentialRequestOptions: {
              publicKey: {
                challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                rpId: "localhost",
                timeout: 300000,
                userVerification: "required",
                allowCredentials: [
                  {
                    id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
                    type: "public-key",
                  },
                ],
              },
            },
          },
        },
      },
      { status: 201 },
    )
  }
  if (url.includes("/v2/sessions/session-v2") && method === "PATCH") {
    sessionToken = body?.checks?.otpEmail ? "token-verified" : "token-resent"
    return Response.json({ sessionToken })
  }
  if (url.includes("/v2/sessions/session-v2?") && method === "GET") {
    const query = new URL(url).searchParams
    if (query.get("sessionToken") !== sessionToken) return Response.json({}, { status: 401 })
    return Response.json({
      session: {
        id: "session-v2",
        expirationDate: "2027-02-01T00:00:00Z",
        factors: {
          user: { id: "user-v2", organizationId: "org-test" },
          password: { verifiedAt: new Date(1_800_000_000 * 1000).toISOString() },
          otpEmail: { verifiedAt: new Date(1_800_000_000 * 1000).toISOString() },
          webAuthN: { verifiedAt: new Date(1_800_000_000 * 1000).toISOString(), userVerified: true },
        },
      },
    })
  }
  return Response.json({ error: "not_found" }, { status: 404 })
}

const app = workerAppCreate({ fetch: mockZitadelFetch })

const distDir = join(import.meta.dirname, "../dist/client")

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname.startsWith("/api/")) {
      const headers = new Headers(req.headers)
      headers.set("origin", pagesOrigin)
      const apiReq = new Request(req.url, {
        method: req.method,
        headers,
        ...(req.method !== "GET" && req.method !== "HEAD" ? { body: req.body } : {}),
      })
      return app.fetch(apiReq, bindings)
    }

    const filePath = join(distDir, url.pathname)
    if (existsSync(filePath) && !url.pathname.endsWith("/")) {
      return new Response(Bun.file(filePath))
    }

    return new Response(Bun.file(join(distDir, "index.html")), {
      headers: { "content-type": "text/html" },
    })
  },
})

console.log(`Mock server running on ${pagesOrigin}`)
