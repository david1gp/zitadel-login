import { afterEach, describe, expect, test } from "bun:test"

import { emailOtpStateCreate } from "../client/src/email-otp/ui/emailOtpStateCreate"
import { identityProviderStateCreate } from "../client/src/identity-provider/ui/identityProviderStateCreate"
import { mfaEmailOtpStateCreate } from "../client/src/mfa/ui/mfaEmailOtpStateCreate"
import { mfaSmsOtpStateCreate } from "../client/src/mfa/ui/mfaSmsOtpStateCreate"
import { mfaTotpStateCreate } from "../client/src/mfa/ui/mfaTotpStateCreate"
import { mfaU2fStateCreate } from "../client/src/mfa/ui/mfaU2fStateCreate"
import { passkeyStateCreate } from "../client/src/passkey/ui/passkeyStateCreate"
import { passwordStateCreate } from "../client/src/password/ui/passwordStateCreate"
import { lastUsedLoginMethodCandidateKey } from "../client/src/preferences/model/lastUsedLoginMethodCandidateKey"
import { lastUsedLoginMethodCandidateLoad } from "../client/src/preferences/model/lastUsedLoginMethodCandidateLoad"
import { lastUsedLoginMethodCandidateSave } from "../client/src/preferences/model/lastUsedLoginMethodCandidateSave"
import { lastUsedLoginMethodLoad } from "../client/src/preferences/model/lastUsedLoginMethodLoad"
import { lastUsedLoginMethodPromote } from "../client/src/preferences/model/lastUsedLoginMethodPromote"
import { lastUsedLoginMethodSave } from "../client/src/preferences/model/lastUsedLoginMethodSave"
import { createSignalObject } from "../client/src/ui/createSignalObject"

const apiOrigin = "https://worker.example"
const flowHandle = "flow-handle-123"
const csrfToken = "B".repeat(43)
const completePath = `/api/v2/flow/continue?flow=${flowHandle}`
const submitEvent = { preventDefault: () => undefined } as unknown as SubmitEvent
const originalFetch = globalThis.fetch

function storageCreate(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

function completeResponse() {
  return Response.json({ success: true, data: { kind: "complete", path: completePath } })
}

function mfaRenderResponse() {
  return Response.json({
    success: true,
    data: {
      kind: "render",
      route: `/login/mfa?flow=${flowHandle}`,
      screen: { name: "mfa" },
      csrfToken,
    },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("last-used login method transition wiring", () => {
  test("stages a primary success entering MFA and promotes it only at completion", async () => {
    const localStorage = storageCreate()
    const sessionStorage = storageCreate()
    globalThis.fetch = async () => mfaRenderResponse()

    const password = passwordStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: createSignalObject(csrfToken),
      flowHandle: createSignalObject(flowHandle),
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (selection) => {
        if (selection.method === "mfa") return
        const primary = selection.method === "identity_provider" ? selection : { method: selection.method }
        lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle, "org-1", primary)
      },
      notice: createSignalObject(""),
      preferenceSave: () => undefined,
      statusContinue: () => undefined,
    })
    password.identifierInput("user@example.com")
    password.passwordInput("secret")
    await password.submit(submitEvent)

    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({ success: true, data: undefined })
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey(flowHandle))).not.toBeNull()

    const promoted = lastUsedLoginMethodPromote(localStorage, sessionStorage, flowHandle, "org-1", { version: 1 })
    expect(promoted).toEqual({ success: true, data: { version: 1, primary: { method: "password" } } })
    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({
      success: true,
      data: { version: 1, primary: { method: "password" } },
    })
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey(flowHandle))).toBeNull()
  })

  test("records successful primary methods and stages the exact provider id for resume", async () => {
    let saved: unknown
    const events: string[] = []
    globalThis.fetch = async () => completeResponse()

    const email = emailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: createSignalObject(csrfToken),
      flowHandle: createSignalObject(flowHandle),
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (selection) => {
        saved = selection
        events.push("email-save")
      },
      notice: createSignalObject(""),
      preferenceSave: () => undefined,
      statusContinue: () => events.push("email-continue"),
      storage: storageCreate(),
    })
    email.codeInput("123456")
    await email.codeSubmit(submitEvent)
    expect(saved).toEqual({ method: "email_otp" })
    expect(events).toEqual(["email-save", "email-continue"])

    const password = passwordStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: createSignalObject(csrfToken),
      flowHandle: createSignalObject(flowHandle),
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (selection) => {
        saved = selection
      },
      notice: createSignalObject(""),
      preferenceSave: () => undefined,
      statusContinue: () => undefined,
    })
    password.identifierInput("user@example.com")
    password.passwordInput("secret")
    await password.submit(submitEvent)
    expect(saved).toEqual({ method: "password" })

    const passkey = passkeyStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: createSignalObject(csrfToken),
      flowHandle: createSignalObject(flowHandle),
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (selection) => {
        saved = selection
      },
      notice: createSignalObject(""),
      preferenceSave: () => undefined,
      statusContinue: () => undefined,
      isSupported: true,
    })
    await passkey.submit(submitEvent)
    expect(saved).toEqual({ method: "passkey" })

    let assignedLocation = ""
    const sessionStorage = storageCreate()
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { redirectUrl: `/api/v2/identity-provider/redirect?flow=${flowHandle}` },
      })
    const provider = identityProviderStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: () => csrfToken,
      flowHandle: () => flowHandle,
      provider: () => ({ id: "github-exact-42", name: "GitHub", type: "github" }),
      subroute: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (selection) => {
        saved = selection
        if (selection.method !== "mfa") {
          lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle, "org-1", selection)
        }
      },
      statusContinue: () => undefined,
      preferenceSave: () => undefined,
      browserWindow: {
        location: {
          assign: (path: string) => {
            assignedLocation = path
          },
        },
      } as unknown as Window,
    })
    await provider.submit(submitEvent)
    expect(saved).toEqual({ method: "identity_provider", identityProviderId: "github-exact-42" })
    expect(assignedLocation).toBe(`/api/v2/identity-provider/redirect?flow=${flowHandle}`)
    expect(lastUsedLoginMethodCandidateLoad(sessionStorage, flowHandle, "org-1")).toEqual({
      success: true,
      data: { method: "identity_provider", identityProviderId: "github-exact-42" },
    })
  })

  test("records every successful MFA factor after verification", async () => {
    const storage = storageCreate()
    const saveCalls: string[] = []
    const factorSaved = (factor: string) => saveCalls.push(factor)

    const totp = mfaTotpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => factorSaved("totp"),
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      fetchFn: async () => completeResponse(),
    })
    totp.codeInput("123456")
    await totp.submit(submitEvent)

    const email = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => factorSaved("email_otp"),
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      fetchFn: async () => completeResponse(),
      storage,
    })
    email.codeInput("123456")
    await email.submit(submitEvent)

    const sms = mfaSmsOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => factorSaved("sms_otp"),
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      fetchFn: async () => completeResponse(),
    })
    sms.codeInput("123456")
    await sms.submit(submitEvent)

    const credential = {
      id: "cred-1",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      response: {
        clientDataJSON: new Uint8Array([4, 5, 6]).buffer,
        authenticatorData: new Uint8Array([7, 8, 9]).buffer,
        signature: new Uint8Array([10, 11, 12]).buffer,
        userHandle: null,
      },
    } as unknown as Credential
    const webAuthnOptions = {
      publicKey: {
        challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
        rpId: "login.example",
        timeout: 300000,
        allowCredentials: [{ id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM", type: "public-key" }],
      },
    }

    for (const factor of ["u2f", "passkey"] as const) {
      const u2f = mfaU2fStateCreate({
        apiOrigin: () => apiOrigin,
        flowHandle: () => flowHandle,
        factorType: () => factor,
        csrfToken: () => csrfToken,
        csrfTokenSet: () => undefined,
        busy: () => false,
        busySet: () => undefined,
        errorClear: () => undefined,
        failureSet: () => undefined,
        fallbackContinue: () => undefined,
        lastUsedSave: (savedFactor) => factorSaved(savedFactor),
        statusContinue: () => undefined,
        showRootChooser: () => undefined,
        credentialsGet: async () => credential,
        isSupported: true,
        fetchFn: async (input) => {
          if (String(input).includes("/challenge")) {
            return Response.json({
              success: true,
              data: {
                kind: "render",
                route: `/login/mfa?flow=${flowHandle}`,
                screen: { name: "mfa", options: webAuthnOptions },
                csrfToken,
              },
            })
          }
          return completeResponse()
        },
      })
      await u2f.submit()
    }

    expect(saveCalls).toEqual(["totp", "email_otp", "sms_otp", "u2f", "passkey"])
  })

  test("promotes the pending primary after an enrollment assertion without recording its factor", async () => {
    const localStorage = storageCreate()
    const sessionStorage = storageCreate()
    lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle, "org-1", { method: "password" })

    const credential = {
      id: "cred-1",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      response: {
        clientDataJSON: new Uint8Array([4, 5, 6]).buffer,
        authenticatorData: new Uint8Array([7, 8, 9]).buffer,
        signature: new Uint8Array([10, 11, 12]).buffer,
        userHandle: null,
      },
    } as unknown as Credential
    const webAuthnOptions = {
      publicKey: {
        challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
        rpId: "login.example",
        timeout: 300000,
        allowCredentials: [{ id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM", type: "public-key" }],
      },
    }

    const state = mfaU2fStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      factorType: () => "passkey",
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: (factor) => lastUsedLoginMethodSave(localStorage, "org-1", { version: 1, mfa: factor }),
      enrollmentPending: () => true,
      statusContinue: () => {
        lastUsedLoginMethodPromote(localStorage, sessionStorage, flowHandle, "org-1", { version: 1 })
      },
      showRootChooser: () => undefined,
      credentialsGet: async () => credential,
      isSupported: true,
      initialOptions: () => webAuthnOptions,
      fetchFn: async () => completeResponse(),
    })

    await state.submit()

    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({
      success: true,
      data: { version: 1, primary: { method: "password" } },
    })
  })

  test("does not record failed, fallback, or enrollment factor transitions", async () => {
    let saveCount = 0
    const localStorage = storageCreate()
    const sessionStorage = storageCreate()
    lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle, "org-1", { method: "password" })
    globalThis.fetch = async () =>
      Response.json({ success: false, op: "passwordVerify", errorMessage: "invalid_credentials" }, { status: 401 })

    const password = passwordStateCreate({
      apiOrigin: () => apiOrigin,
      busy: createSignalObject(false),
      csrfToken: createSignalObject(csrfToken),
      flowHandle: createSignalObject(flowHandle),
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => saveCount++,
      notice: createSignalObject(""),
      preferenceSave: () => undefined,
      statusContinue: () => undefined,
    })
    password.identifierInput("user@example.com")
    password.passwordInput("secret")
    await password.submit(submitEvent)

    const totp = mfaTotpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => saveCount++,
      statusContinue: () => undefined,
      showRootChooser: () => undefined,
      fetchFn: async () => Response.json({ success: true, data: { kind: "fallback", path: "/api/v2/flow/fallback" } }),
    })
    totp.codeInput("123456")
    await totp.submit(submitEvent)

    const enrollment = mfaEmailOtpStateCreate({
      apiOrigin: () => apiOrigin,
      flowHandle: () => flowHandle,
      csrfToken: () => csrfToken,
      csrfTokenSet: () => undefined,
      busy: () => false,
      busySet: () => undefined,
      errorClear: () => undefined,
      failureSet: () => undefined,
      fallbackContinue: () => undefined,
      lastUsedSave: () => saveCount++,
      statusContinue: () => {
        lastUsedLoginMethodPromote(localStorage, sessionStorage, flowHandle, "org-1", { version: 1 })
      },
      showRootChooser: () => undefined,
      fetchFn: async () =>
        Response.json({
          success: true,
          data: { kind: "complete", path: completePath },
        }),
      isEnrollment: true,
      codePending: true,
      storage: sessionStorage,
    })
    enrollment.codeInput("123456")
    await enrollment.submit(submitEvent)

    expect(saveCount).toBe(0)
    expect(lastUsedLoginMethodLoad(localStorage, "org-1")).toEqual({
      success: true,
      data: { version: 1, primary: { method: "password" } },
    })
    expect(sessionStorage.getItem(lastUsedLoginMethodCandidateKey(flowHandle))).toBeNull()
  })
})
