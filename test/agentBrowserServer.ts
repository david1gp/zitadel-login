import { existsSync } from "node:fs"
import { join } from "node:path"

const port = 3001
const pagesOrigin = `http://localhost:${port}`
const validFlow = "AAAAAAAAAAAAAAAAAAAAAA"
const validCsrf = "B".repeat(43)
const emailOtpEnrollmentActivated = new Set<string>()

const bootstrap = {
  branding: {
    dark: {
      colors: { background: "#17191c", font: "#f4f5f5", primary: "#d7f06c", warn: "#ff4d4d" },
      logoUrl: `${pagesOrigin}/logo-dark.png`,
    },
    disableWatermark: true,
    light: {
      colors: { background: "#f5f3ed", font: "#15201d", primary: "#1d5c4b", warn: "#a9362b" },
      logoUrl: `${pagesOrigin}/logo-light.png`,
    },
    themeMode: "system",
  },
  identityProviders: [{ id: "github", name: "GitHub", type: "github" }],
  organization: { id: "org-1", name: "Contentoren" },
  primaryMethods: ["email_otp", "password", "passkey", "identity_provider"],
  updatedAt: 1,
}

const mockRecentAccounts = [
  {
    id: "acc_alice123",
    label: "Alice Smith",
    avatarUrl: `${pagesOrigin}/avatar-alice.png`,
    lastUsedAt: 1000,
    reauthenticationRequired: false,
  },
  {
    id: "acc_bob456",
    label: "Bob Jones",
    avatarUrl: `${pagesOrigin}/broken-avatar.png`,
    lastUsedAt: 2000,
    reauthenticationRequired: true,
  },
  {
    id: "acc_stale999",
    label: "Stale User",
    lastUsedAt: 500,
    reauthenticationRequired: false,
  },
]

const distDir = join(import.meta.dirname, "../dist/client")

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/broken-avatar.png") {
      return new Response("Not found", { status: 404 })
    }
    if (url.pathname === "/avatar-alice.png") {
      return new Response("PNG", { headers: { "content-type": "image/png" } })
    }

    if (url.pathname === "/api/v2/bootstrap") {
      return Response.json({ success: true, data: bootstrap })
    }

    if (url.pathname === "/api/v2/flow/initialize" || url.pathname === "/api/v2/flow/resume") {
      const requestedFlow = url.searchParams.get("flow")
      const isMfa = requestedFlow === "mfa-flow" || req.headers.get("referer")?.includes("/login/mfa")
      const flow =
        requestedFlow === "CCCCCCCCCCCCCCCCCCCCCC" ||
        requestedFlow === "DDDDDDDDDDDDDDDDDDDDDD" ||
        requestedFlow === "EEEEEEEEEEEEEEEEEEEEEE" ||
        requestedFlow === "FFFFFFFFFFFFFFFFFFFFFF" ||
        requestedFlow === "GGGGGGGGGGGGGGGGGGGGGG"
          ? requestedFlow
          : validFlow
      if (requestedFlow === "EEEEEEEEEEEEEEEEEEEEEE") {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa/u2f?flow=${flow}`,
            screen: { name: "mfa_webauthn_setup", method: "u2f" },
            csrfToken: validCsrf,
          },
        })
      }
      if (requestedFlow === "GGGGGGGGGGGGGGGGGGGGGG") {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa/email-otp?flow=${flow}`,
            screen: emailOtpEnrollmentActivated.has(flow)
              ? { name: "mfa_email_otp_code", challengeIssued: true }
              : { name: "mfa" },
            csrfToken: validCsrf,
          },
        })
      }
      if (requestedFlow === "FFFFFFFFFFFFFFFFFFFFFF") {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa/u2f?flow=${flow}`,
            screen: { name: "mfa" },
            csrfToken: validCsrf,
          },
        })
      }
      return Response.json({
        success: true,
        data: {
          kind: "render",
          route: isMfa ? `/login/mfa/totp?flow=${flow}` : `/login?flow=${validFlow}`,
          screen: isMfa
            ? { name: requestedFlow === "CCCCCCCCCCCCCCCCCCCCCC" ? "mfa_totp_setup" : "mfa" }
            : {
                name: "email_otp_start",
                recentAccounts: mockRecentAccounts,
              },
          csrfToken: validCsrf,
        },
      })
    }
    if (url.pathname === "/api/v2/mfa/options") {
      const flow = url.searchParams.get("flow")
      if (flow === "mfa-email-check-flow") {
        return Response.json({
          success: true,
          data: {
            mode: "check",
            method: { type: "email_otp" },
          },
        })
      }
      if (flow === "mfa-sms-check-flow") {
        return Response.json({
          success: true,
          data: {
            mode: "check",
            method: { type: "sms_otp" },
          },
        })
      }
      if (flow === "FFFFFFFFFFFFFFFFFFFFFF") {
        return Response.json({
          success: true,
          data: { mode: "enroll", methods: [{ type: "u2f" }] },
        })
      }
      if (flow === "GGGGGGGGGGGGGGGGGGGGGG") {
        return Response.json({
          success: true,
          data: { mode: "enroll", methods: [{ type: "email_otp" }] },
        })
      }
      if (flow === "DDDDDDDDDDDDDDDDDDDDDD") {
        return Response.json({
          success: true,
          data: { mode: "enroll", methods: [{ type: "totp" }] },
        })
      }
      return Response.json({
        success: true,
        data: {
          mode: "select",
          methods: [{ type: "totp" }, { type: "email_otp" }, { type: "sms_otp" }],
        },
      })
    }

    if (url.pathname === "/api/v2/mfa/u2f/enroll" || url.pathname === "/api/v2/mfa/passkey/enroll") {
      const method = url.pathname.includes("/passkey/") ? "passkey" : "u2f"
      return Response.json(
        {
          success: true,
          data: {
            options: {
              publicKey: {
                attestation: "none",
                authenticatorSelection: { userVerification: method === "passkey" ? "required" : "discouraged" },
                challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                rp: { id: "localhost", name: "Contentoren" },
                timeout: 300000,
                user: { displayName: "User", id: "dXNlci1pZA", name: "user@example.com" },
              },
            },
            transition: {
              kind: "render",
              route: `/login/mfa/${method}?flow=${url.searchParams.get("flow") ?? validFlow}`,
              screen: { name: "mfa_webauthn_setup", method },
              csrfToken: validCsrf,
            },
          },
        },
        { status: 201 },
      )
    }

    if (url.pathname === "/api/v2/mfa/u2f/enroll/verify" || url.pathname === "/api/v2/mfa/passkey/enroll/verify") {
      const method = url.pathname.includes("/passkey/") ? "passkey" : "u2f"
      return Response.json({
        success: true,
        data: {
          transition: {
            kind: "render",
            route: `/login/mfa/${method}?flow=${url.searchParams.get("flow") ?? validFlow}`,
            screen: {
              name: "mfa",
              factors: ["AUTHENTICATION_METHOD_TYPE_U2F"],
              options: {
                publicKey: {
                  challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
                  rpId: "localhost",
                  userVerification: method === "passkey" ? "required" : "discouraged",
                },
              },
            },
            csrfToken: validCsrf,
          },
        },
      })
    }

    if (url.pathname === "/api/v2/mfa/email-otp/enroll") {
      const body = (await req.json()) as Record<string, unknown>
      if (body.method !== "email_otp" || body.csrfToken !== validCsrf || "email" in body) {
        return Response.json(
          { success: false, op: "mfaEmailOtpEnrollment", errorMessage: "csrf_rejected" },
          { status: 403 },
        )
      }
      emailOtpEnrollmentActivated.add(url.searchParams.get("flow") ?? validFlow)
      return Response.json(
        {
          success: true,
          data: {
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${url.searchParams.get("flow") ?? validFlow}`,
              screen: { name: "mfa_email_otp_code", challengeIssued: true },
              csrfToken: validCsrf,
            },
          },
        },
        { status: 201 },
      )
    }

    if (url.pathname === "/api/v2/mfa/otp/enroll") {
      return Response.json(
        {
          success: true,
          data: {
            provisioningUri:
              "otpauth://totp/Contentoren:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Contentoren&algorithm=SHA1&digits=6&period=30",
            secret: "JBSWY3DPEHPK3PXP",
            transition: {
              kind: "render",
              route: `/login/mfa?flow=${validFlow}`,
              screen: { name: "mfa_totp_setup" },
              csrfToken: validCsrf,
            },
          },
        },
        { status: 201 },
      )
    }

    if (url.pathname === "/api/v2/mfa/otp/enroll/verify") {
      const body = (await req.json()) as { code: string; csrfToken: string }
      if (body.code === "123456") {
        return Response.json({
          success: true,
          data: { transition: { kind: "complete", path: `/api/v2/flow/continue?flow=${validFlow}` } },
        })
      }
      return Response.json(
        { success: false, op: "mfaTotpEnrollmentVerify", errorMessage: "code_invalid" },
        { status: 401 },
      )
    }

    if (
      url.pathname === "/api/v2/mfa/email-otp/challenge" ||
      url.pathname === "/api/v2/mfa/sms-otp/challenge" ||
      url.pathname === "/api/v2/mfa/otp/challenge"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa" },
            csrfToken: validCsrf,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      )
    }

    if (
      url.pathname === "/api/v2/mfa/email-otp/resend" ||
      url.pathname === "/api/v2/mfa/sms-otp/resend" ||
      url.pathname === "/api/v2/mfa/otp/resend"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa" },
            csrfToken: validCsrf,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      )
    }

    if (
      url.pathname === "/api/v2/mfa/totp/verify" ||
      url.pathname === "/api/v2/mfa/email-otp/verify" ||
      url.pathname === "/api/v2/mfa/sms-otp/verify" ||
      url.pathname === "/api/v2/mfa/otp/verify"
    ) {
      const body = (await req.json()) as { code: string; csrfToken: string }
      if (body.code === "123456" || body.code === "12345678") {
        return Response.json({
          success: true,
          data: {
            kind: "complete",
            path: `/api/v2/flow/continue?flow=${validFlow}`,
          },
        })
      }
      if (body.code === "777777" || body.code === "77777777") {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/mfa?flow=${validFlow}`,
            screen: { name: "mfa" },
            csrfToken: validCsrf,
          },
        })
      }
      return Response.json(
        {
          success: false,
          op: "mfaOtpVerify",
          errorMessage: "code_invalid",
        },
        { status: 401 },
      )
    }

    if (url.pathname === "/api/v2/session/continue") {
      const body = (await req.json()) as { accountId: string; csrfToken: string }
      if (body.accountId === "acc_alice123") {
        return Response.json({
          success: true,
          data: {
            kind: "complete",
            path: `/api/v2/flow/continue?flow=${validFlow}`,
          },
        })
      }
      if (body.accountId === "acc_bob456") {
        return Response.json({
          success: true,
          data: {
            kind: "render",
            route: `/login/email-otp?flow=${validFlow}`,
            screen: {
              name: "email_otp_start",
              loginHint: "bob@example.com",
            },
            csrfToken: validCsrf,
          },
        })
      }
      if (body.accountId === "acc_stale999") {
        return Response.json(
          { success: false, op: "sessionContinue", errorMessage: "account_invalid" },
          { status: 401 },
        )
      }
    }

    if (url.pathname === "/api/v2/identity-provider/start") {
      return Response.json({
        success: true,
        data: { redirectUrl: `/api/v2/identity-provider/redirect?flow=${validFlow}` },
      })
    }

    if (url.pathname === "/api/v2/identity-provider/redirect") {
      return new Response("Simulated external IdP page", { status: 200 })
    }

    if (url.pathname === `/api/v2/flow/continue`) {
      return new Response("Authorized successfully!", { status: 200 })
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

console.log(`Agent-browser mock server running on ${pagesOrigin}`)
