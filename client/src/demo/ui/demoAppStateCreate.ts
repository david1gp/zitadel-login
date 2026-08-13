import { createMemo, onCleanup, onMount } from "solid-js"

import { appFocusStateCreate } from "../../app/model/appFocusStateCreate"
import { brandingStateCreate } from "../../branding/ui/brandingStateCreate"
import { browserHistoryNavigate } from "../../flow/model/browserHistoryNavigate"
import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { loginMethodsGet } from "../../flow/model/loginMethodsGet"
import { browserStorageGet } from "../../preferences/model/browserStorageGet"
import { loginIdentifierNormalize } from "../../preferences/model/loginIdentifierNormalize"
import { createSignalObject } from "../../ui/createSignalObject"
import { demoBootstrap } from "../model/demoBootstrap"
import { demoChromeRead } from "../model/demoChromeRead"
import type { DemoChrome } from "../model/demoChromeSchema"
import { demoDelay } from "../model/demoDelay"
import { demoEmailMaskGet } from "../model/demoEmailMaskGet"
import { demoFetchCreate } from "../model/demoFetchCreate"
import { demoMethodPathGet } from "../model/demoMethodPathGet"
import { demoMfaPathGet } from "../model/demoMfaPathGet"
import { demoMfaSelectionGet } from "../model/demoMfaSelectionGet"
import { demoPasskeyAssertionCredentialGet } from "../model/demoPasskeyAssertionCredentialGet"
import { demoPasskeyAttestationCredentialCreate } from "../model/demoPasskeyAttestationCredentialCreate"
import { demoPickerRead } from "../model/demoPickerRead"
import { demoRecentAccounts } from "../model/demoRecentAccounts"
import { demoScenarioRead } from "../model/demoScenarioRead"
import type { DemoScenario } from "../model/demoScenarioSchema"
import { demoScenarios } from "../model/demoScenarios"
import { demoUrlGet } from "../model/demoUrlGet"

export function demoAppStateCreate(browserWindow: Window = window) {
  const locationRead = () => {
    const next = demoScenarioRead(browserWindow.location.pathname)
    scenario.set(next)
    chrome.set(demoChromeRead(browserWindow.location.search))
    pickerOpen.set(demoPickerRead(browserWindow.location.search))
  }

  const scenario = createSignalObject<DemoScenario>(demoScenarioRead(browserWindow.location.pathname))
  const chrome = createSignalObject<DemoChrome>(demoChromeRead(browserWindow.location.search))
  const pickerOpen = createSignalObject(demoPickerRead(browserWindow.location.search))
  const bootstrap = createSignalObject(demoBootstrap)
  const error = createSignalObject("")
  const notice = createSignalObject("")
  const busy = createSignalObject(false)
  const csrfToken = createSignalObject("A".repeat(43))
  const email = createSignalObject("ada@example.com")
  const code = createSignalObject("")
  const emailStep = createSignalObject<"email" | "code">("email")
  const rememberIdentifier = createSignalObject(true)
  const passwordIdentifier = createSignalObject("ada@example.com")
  const passwordValue = createSignalObject("")
  const passwordShow = createSignalObject(false)
  const passkeyIdentifier = createSignalObject("ada@example.com")
  const completed = createSignalObject("")

  const storageResult = browserStorageGet(browserWindow)
  const storage = storageResult.success ? storageResult.data : undefined
  const branding = brandingStateCreate(bootstrap, storage)
  const focusState = appFocusStateCreate()
  const fetchFn = demoFetchCreate(() => scenario.get().id)

  const urlWrite = (path: string, replace = false) => {
    browserHistoryNavigate(browserWindow, demoUrlGet({ path, chrome: chrome.get(), picker: pickerOpen.get() }), replace)
  }

  const snapshotApply = () => {
    const id = scenario.get().id
    if (id === "password-error") error.set("Incorrect username or password.")
    if (id === "email-otp-code") {
      emailStep.set("code")
      notice.set("Verification code sent to your email address.")
    }
    if (id === "email-otp-email") emailStep.set("email")
  }

  const scenarioOpen = (path: string, replace = false) => {
    error.set("")
    notice.set("")
    completed.set("")
    busy.set(false)
    urlWrite(path, replace)
    locationRead()
    snapshotApply()
    focusState.focusHeading()
  }

  const popstate = () => {
    locationRead()
    snapshotApply()
  }

  onMount(() => {
    snapshotApply()
    browserWindow.addEventListener("popstate", popstate)
    onCleanup(() => browserWindow.removeEventListener("popstate", popstate))
  })

  const methods = createMemo(() => loginMethodsGet(bootstrap.get()))
  const currentIndex = createMemo(() => demoScenarios.findIndex((entry) => entry.id === scenario.get().id))

  const emailValid = createMemo(() => {
    const value = email.get().trim()
    return value.includes("@") && value.length > 2
  })
  const passwordValid = createMemo(() => passwordIdentifier.get().trim().length > 0 && passwordValue.get().length > 0)

  const chromeSelect = (value: DemoChrome) => {
    chrome.set(value)
    urlWrite(scenario.get().path, true)
  }

  const pickerToggle = () => {
    pickerOpen.set(!pickerOpen.get())
    urlWrite(scenario.get().path, true)
  }

  const neighborOpen = (offset: number) => {
    const index = currentIndex()
    const next = demoScenarios[index + offset]
    if (next) scenarioOpen(next.path)
  }

  const completedSet = async (message: string) => {
    busy.set(true)
    await demoDelay(280)
    busy.set(false)
    completed.set(message)
    notice.set(message)
  }

  return {
    scenario: scenario.get,
    chrome: chrome.get,
    pickerOpen: pickerOpen.get,
    scenarios: () => demoScenarios,
    methods,
    recentAccounts: () => (scenario.get().id === "chooser-recent" ? demoRecentAccounts : []),
    bootstrap: bootstrap.get,
    error: error.get,
    notice: notice.get,
    busy: busy.get,
    completed: completed.get,
    csrfToken: csrfToken.get,
    flowHandle: () => "demo-flow",
    apiOrigin: () => "",
    fetchFn,
    brandAssetUrl: branding.brandAssetUrl,
    brandAssetFail: branding.brandAssetFail,
    preferredTheme: branding.preferredTheme,
    themeSwitchable: branding.themeSwitchable,
    themeSelect: branding.themeSelect,
    headingRegister: focusState.headingRegister,
    errorRegister: focusState.errorRegister,
    focusHeading: focusState.focusHeading,
    chromeSelect,
    pickerToggle,
    scenarioOpen,
    previousOpen: () => neighborOpen(-1),
    nextOpen: () => neighborOpen(1),
    hasPrevious: () => currentIndex() > 0,
    hasNext: () => currentIndex() >= 0 && currentIndex() < demoScenarios.length - 1,
    errorClear: () => error.set(""),
    failureSet: (message: string) => {
      error.set(message)
      focusState.focusError()
    },
    csrfTokenSet: (token: string) => csrfToken.set(token),
    busySet: (value: boolean) => busy.set(value),
    fallbackContinue: () => void completedSet("Would continue in ZITADEL."),
    statusContinue: () => void completedSet("Would continue the signed-in session."),
    passwordChangeTransitionApply: () => void completedSet("Password changed. Next login step would render."),
    routeSet: (next: LoginMethodSelection | undefined) => {
      scenarioOpen(demoMfaPathGet(next, scenario.get().id))
    },
    methodSelect: (selection: LoginMethodSelection) => {
      scenarioOpen(demoMethodPathGet(selection))
    },
    accountSelect: (accountId: string) => {
      const account = demoRecentAccounts.find((entry) => entry.id === accountId)
      if (account) passwordIdentifier.set(account.label)
      scenarioOpen("/demo/password")
    },
    showChooser: () => scenarioOpen("/demo/chooser"),
    showDirectory: () => scenarioOpen("/demo"),
    loginReturn: () => scenarioOpen("/demo/chooser"),
    passwordRecoveryStart: () => scenarioOpen("/demo/password/forgot"),
    emailStep: () => (scenario.get().id === "email-otp-code" ? "code" : emailStep.get()),
    email: email.get,
    code: code.get,
    emailValid,
    maskedEmail: () => demoEmailMaskGet(email.get() || "ada@example.com"),
    rememberIdentifier: rememberIdentifier.get,
    emailInputRegister: () => undefined,
    codeInputRegister: () => undefined,
    emailInput: (value: string) => email.set(value),
    codeInput: (value: string) => code.set(value),
    rememberIdentifierChange: (event: Event & { currentTarget: HTMLInputElement }) => {
      rememberIdentifier.set(event.currentTarget.checked)
    },
    emailSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      const normalized = loginIdentifierNormalize(email.get())
      email.set(normalized)
      if (!emailValid()) {
        error.set("Enter a valid email address.")
        return
      }
      emailStep.set("code")
      scenarioOpen("/demo/email-otp/code")
    },
    codeSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      if (code.get().length < 6) {
        error.set("Enter the complete verification code.")
        return
      }
      void completedSet("Email code accepted. Sign-in would continue.")
    },
    resend: () => notice.set("A new verification code was sent."),
    emailChange: () => {
      emailStep.set("email")
      code.set("")
      notice.set("")
      scenarioOpen("/demo/email-otp")
    },
    passwordIdentifier: passwordIdentifier.get,
    passwordValue: passwordValue.get,
    passwordShow: passwordShow.get,
    passwordValid,
    passwordMfaRequired: () => scenario.get().id === "password-mfa",
    passwordRecoveryAvailable: () => true,
    passwordIdentifierInputRegister: () => undefined,
    passwordInputRegister: () => undefined,
    passwordIdentifierInput: (value: string) => passwordIdentifier.set(value),
    passwordInput: (value: string) => passwordValue.set(value),
    passwordToggleShow: () => passwordShow.set(!passwordShow.get()),
    passwordSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      if (!passwordValid()) {
        error.set("Enter your username and password.")
        return
      }
      void completedSet("Password accepted. Sign-in would continue.")
    },
    passkeyIdentifier: passkeyIdentifier.get,
    passkeyOptions: () => undefined,
    passkeyMfaRequired: () => scenario.get().id === "passkey-mfa",
    passkeyIsSupported: () => scenario.get().id !== "passkey-unsupported",
    passkeyIdentifierInputRegister: () => undefined,
    passkeyIdentifierInput: (value: string) => passkeyIdentifier.set(value),
    passkeySubmit: (event?: SubmitEvent) => {
      event?.preventDefault()
      void completedSet("Passkey ceremony would run in a real browser.")
    },
    identityProviderProviderName: () => "Google",
    identityProviderProviderType: () => "google",
    identityProviderSubroute: () => {
      const id = scenario.get().id
      if (id === "idp-failure") return "failure" as const
      if (id === "idp-account-not-found") return "account-not-found" as const
      if (id === "idp-linking-failed") return "linking-failed" as const
      if (id === "idp-registration-failed") return "registration-failed" as const
      return undefined
    },
    identityProviderSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void completedSet("Would redirect to the identity provider.")
    },
    mfaSelection: () => demoMfaSelectionGet(scenario.get().id),
    totpSetupUnavailable: () => scenario.get().id === "mfa-totp-unavailable",
    emailOtpCodePending: () => scenario.get().id === "mfa-email-otp-code",
    webAuthnSetupUnavailable: () => (scenario.get().id === "mfa-webauthn-unavailable" ? "passkey" : undefined),
    mfaIsSupported: () => scenario.get().id !== "mfa-u2f-unsupported",
    credentialsGet: async () => {
      await demoDelay(180)
      return demoPasskeyAssertionCredentialGet()
    },
    credentialsCreate: async () => {
      await demoDelay(180)
      return demoPasskeyAttestationCredentialCreate()
    },
    passwordChangeExpired: () => scenario.get().id === "password-change-expired",
    recoveryInitialStep: () => {
      const id = scenario.get().id
      if (id === "recovery-sent") return "sent" as const
      if (id === "recovery-fatal") return "fatal" as const
      if (id === "recovery-loading") return "loading" as const
      if (id === "recovery-request") return "email" as const
      return undefined
    },
    resetInitialStep: () => {
      const id = scenario.get().id
      if (id === "reset-complete") return "complete" as const
      if (id === "reset-invalid") return "invalid_link" as const
      if (id === "reset-loading") return "loading" as const
      if (id === "reset") return "ready" as const
      return undefined
    },
  }
}
