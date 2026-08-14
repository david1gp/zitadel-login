import { cleanup, render, screen } from "@solidjs/testing-library"
import { afterEach, describe, expect, test, vi } from "vitest"

import { App } from "../client/src/app/ui/App"
import { fallbackBootstrap } from "../client/src/branding/model/fallbackBootstrap"
import { lastUsedLoginMethodCandidateKey } from "../client/src/preferences/model/lastUsedLoginMethodCandidateKey"
import { lastUsedLoginMethodCandidateSave } from "../client/src/preferences/model/lastUsedLoginMethodCandidateSave"
import { lastUsedLoginMethodLoad } from "../client/src/preferences/model/lastUsedLoginMethodLoad"

const apiOrigin = "https://worker.example"
const flowHandle = "A".repeat(22)
const csrfToken = "C".repeat(43)
const originalFetch = globalThis.fetch

const bootstrap = {
  ...fallbackBootstrap,
  identityProviders: [{ id: "google-1", name: "Google", type: "google" as const }],
  organization: { id: "org-1", name: "Organization" },
  primaryMethods: ["identity_provider" as const],
}

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, "", "/login")
})

describe("App initialization last-used primary candidate handling", () => {
  test.each([
    {
      name: "failed identity-provider callback",
      path: `/login/idp/google-1/failure?flow=${flowHandle}`,
      transition: {
        kind: "render" as const,
        route: `/login/idp/google-1/failure?flow=${flowHandle}`,
        screen: { name: "email_otp_start" as const },
        csrfToken,
      },
      expectedCandidate: false,
      expectedPrimary: undefined,
    },
    {
      name: "successful callback to MFA",
      path: `/login/mfa?flow=${flowHandle}`,
      transition: {
        kind: "render" as const,
        route: `/login/mfa?flow=${flowHandle}`,
        screen: { name: "mfa" as const },
        csrfToken,
      },
      expectedCandidate: true,
      expectedPrimary: undefined,
    },
    {
      name: "successful no-MFA resume",
      path: `/login?flow=${flowHandle}`,
      transition: { kind: "complete" as const, path: `/api/v2/flow/continue?flow=${flowHandle}` },
      expectedCandidate: false,
      expectedPrimary: { method: "identity_provider", identityProviderId: "google-1" },
    },
  ])(
    "$name does not misattribute the staged primary method",
    async ({ path, transition, expectedCandidate, expectedPrimary }) => {
      window.history.replaceState(null, "", path)
      lastUsedLoginMethodCandidateSave(window.sessionStorage, flowHandle, "org-1", {
        method: "identity_provider",
        identityProviderId: "google-1",
      })
      globalThis.fetch = vi.fn(async (input) => {
        const url = String(input)
        if (url.endsWith("/api/v2/bootstrap")) return Response.json({ success: true, data: bootstrap })
        if (url.includes("/api/v2/flow/resume")) return Response.json({ success: true, data: transition })
        if (url.includes("/api/v2/mfa/options")) {
          return Response.json({
            success: true,
            data: { mode: "select", methods: [{ type: "totp" }, { type: "email_otp" }] },
          })
        }
        throw new Error(`Unexpected request: ${url}`)
      })

      render(() => <App apiOrigin={apiOrigin} />)

      await vi.waitFor(() => expect(screen.queryByText("Loading sign-in...")).toBeNull())
      expect(window.sessionStorage.getItem(lastUsedLoginMethodCandidateKey(flowHandle)) !== null).toBe(
        expectedCandidate,
      )
      expect(lastUsedLoginMethodLoad(window.localStorage, "org-1")).toEqual({
        success: true,
        data: expectedPrimary ? { version: 1, primary: expectedPrimary } : undefined,
      })
    },
  )
})
