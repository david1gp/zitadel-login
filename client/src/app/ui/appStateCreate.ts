import { createMemo, onCleanup, onMount } from "solid-js"

import { bootstrapApiRequest } from "../../branding/api/bootstrapApiRequest"
import { fallbackBootstrap } from "../../branding/model/fallbackBootstrap"
import { brandingStateCreate } from "../../branding/ui/brandingStateCreate"
import { emailOtpStateCreate } from "../../email-otp/ui/emailOtpStateCreate"
import { browserHistoryNavigate } from "../../flow/model/browserHistoryNavigate"
import { browserLocationAssign } from "../../flow/model/browserLocationAssign"
import { browserUrlRead } from "../../flow/model/browserUrlRead"
import { flowHandleRead } from "../../flow/model/flowHandleRead"
import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { loginMethodsGet } from "../../flow/model/loginMethodsGet"
import { loginRoutePathGet } from "../../flow/model/loginRoutePathGet"
import { loginRouteRead } from "../../flow/model/loginRouteRead"
import { identityProviderStateCreate } from "../../identity-provider/ui/identityProviderStateCreate"
import { passkeyOptionsParse } from "../../passkey/model/passkeyOptionsParse"
import { type PasskeyCredentialsGet, passkeyStateCreate } from "../../passkey/ui/passkeyStateCreate"
import { passwordStateCreate } from "../../password/ui/passwordStateCreate"
import { passwordRecoveryRouteRead } from "../../password-recovery/model/passwordRecoveryRouteRead"

import { browserSessionStorageGet } from "../../preferences/model/browserSessionStorageGet"
import { browserStorageGet } from "../../preferences/model/browserStorageGet"
import { lastUsedLoginMethodCandidateClear } from "../../preferences/model/lastUsedLoginMethodCandidateClear"
import { lastUsedLoginMethodCandidateLoad } from "../../preferences/model/lastUsedLoginMethodCandidateLoad"
import { lastUsedLoginMethodCandidateSave } from "../../preferences/model/lastUsedLoginMethodCandidateSave"
import { lastUsedLoginMethodLoad } from "../../preferences/model/lastUsedLoginMethodLoad"
import { lastUsedLoginMethodPromote } from "../../preferences/model/lastUsedLoginMethodPromote"
import { lastUsedLoginMethodSave } from "../../preferences/model/lastUsedLoginMethodSave"
import type { LastUsedLoginMethod } from "../../preferences/model/lastUsedLoginMethodSchema"
import { loginPreferenceStateCreate } from "../../preferences/ui/loginPreferenceStateCreate"

import { sessionV2ContinueApiRequest } from "../../session/api/sessionV2ContinueApiRequest"
import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"

import { createSignalObject } from "../../ui/createSignalObject"
import { appFocusStateCreate } from "../model/appFocusStateCreate"
import { appInitializationStart } from "../model/appInitializationStart"

type AppStatus = "loading" | "ready" | "continuing" | "fatal" | "password_recovery"

export function appStateCreate(
  apiOrigin: () => string,
  browserWindow: Window = window,
  options?: { credentialsGet?: PasskeyCredentialsGet; passkeySupported?: boolean },
) {
  const status = createSignalObject<AppStatus>("loading")
  const bootstrap = createSignalObject(fallbackBootstrap)
  const selection = createSignalObject<LoginMethodSelection | undefined>(undefined)
  const flowHandle = createSignalObject("")
  const csrfToken = createSignalObject("")
  const error = createSignalObject("")
  const notice = createSignalObject("")
  const busy = createSignalObject(false)
  const recentAccounts = createSignalObject<RecentAccountSummary[]>([])
  const totpSetupUnavailable = createSignalObject(false)
  const emailOtpCodePending = createSignalObject(false)
  const emailOtpEnrollmentPending = createSignalObject(false)
  const webAuthnEnrollmentPending = createSignalObject(false)
  const webAuthnSetupUnavailable = createSignalObject<"u2f" | "passkey" | undefined>(undefined)
  const passwordChangeRequired = createSignalObject<{ expired: boolean } | undefined>(undefined)
  const lastUsedMethods = createSignalObject<LastUsedLoginMethod>({ version: 1 })

  const recoveryRoute = createSignalObject<"request" | "reset" | undefined>(undefined)

  const storageResult = browserStorageGet(browserWindow)
  const storage = storageResult.success ? storageResult.data : undefined
  const sessionStorageResult = browserSessionStorageGet(browserWindow)
  const sessionStorage = sessionStorageResult.success ? sessionStorageResult.data : undefined
  let lastUsedOrganizationId: string | undefined
  const branding = brandingStateCreate(bootstrap, storage)
  const preference = loginPreferenceStateCreate(storage)
  const focusState = appFocusStateCreate()

  const methods = createMemo(() => loginMethodsGet(bootstrap.get()))
  const selectedIdentityProvider = createMemo(() => {
    const selected = selection.get()
    if (selected?.method !== "identity_provider") return undefined
    return bootstrap.get().identityProviders.find((provider) => provider.id === selected.identityProviderId)
  })
  const selectedSubroute = createMemo(() => {
    const selected = selection.get()
    if (selected?.method !== "identity_provider") return undefined
    return selected.subroute
  })

  const failureSet = (message: string) => {
    error.set(message)
    focusState.focusError()
  }
  const apiUrlGet = (path: string) => new URL(path, apiOrigin() || browserWindow.location.origin).toString()

  const identifierGet = (candidate: LoginMethodSelection) => {
    if (candidate.method === "email_otp") return emailOtp.email()
    if (candidate.method === "password") return password.identifier()
    if (candidate.method === "passkey") return passkey.identifier()
    return ""
  }
  const lastUsedInitialize = (nextOrganizationId: string) => {
    lastUsedOrganizationId = nextOrganizationId
    const loaded = lastUsedLoginMethodLoad(storage, lastUsedOrganizationId)
    lastUsedMethods.set(loaded.success && loaded.data ? loaded.data : { version: 1 })
    if (flowHandle.get()) lastUsedLoginMethodCandidateLoad(sessionStorage, flowHandle.get(), nextOrganizationId)
  }
  const lastUsedPrimarySave = (successfulSelection: LoginMethodSelection) => {
    if (successfulSelection.method === "mfa" || !lastUsedOrganizationId || !flowHandle.get()) return
    const primary =
      successfulSelection.method === "identity_provider"
        ? { method: successfulSelection.method, identityProviderId: successfulSelection.identityProviderId }
        : { method: successfulSelection.method }
    lastUsedLoginMethodCandidateSave(sessionStorage, flowHandle.get(), lastUsedOrganizationId, primary)
  }
  const lastUsedPrimaryPromote = () => {
    if (!lastUsedOrganizationId || !flowHandle.get()) return
    const promoted = lastUsedLoginMethodPromote(
      storage,
      sessionStorage,
      flowHandle.get(),
      lastUsedOrganizationId,
      lastUsedMethods.get(),
    )
    if (promoted.success && promoted.data) lastUsedMethods.set(promoted.data)
  }
  const lastUsedCandidateClear = (handle = flowHandle.get()) => {
    if (handle) lastUsedLoginMethodCandidateClear(sessionStorage, handle)
  }
  const lastUsedCandidateClearFromUrl = (url: URL) => {
    const handle = flowHandleRead(url)
    if (handle.success && handle.data) lastUsedCandidateClear(handle.data)
  }
  const lastUsedCandidateClearFromPath = (path: string) => {
    try {
      lastUsedCandidateClearFromUrl(new URL(path, browserWindow.location.origin))
    } catch {}
  }
  const lastUsedMfaSave = (factor: "totp" | "email_otp" | "sms_otp" | "u2f" | "passkey") => {
    if (!lastUsedOrganizationId) return
    const next = { ...lastUsedMethods.get(), mfa: factor }
    lastUsedMethods.set(next)
    lastUsedLoginMethodSave(storage, lastUsedOrganizationId, next)
  }
  const fallbackContinue = (path?: string) => {
    lastUsedCandidateClear()
    emailOtp.reset()
    password.reset()
    passkey.reset()
    status.set("continuing")
    const targetPath = path || (flowHandle.get() ? `/api/v2/flow/fallback?flow=${flowHandle.get()}` : "/api/fallback")
    browserLocationAssign(browserWindow, apiUrlGet(targetPath))
  }
  const statusContinue = (url: string) => {
    if (lastUsedOrganizationId && flowHandle.get()) lastUsedPrimaryPromote()
    else if (flowHandle.get()) lastUsedCandidateClear()
    else lastUsedCandidateClearFromPath(url)
    status.set("continuing")
    browserLocationAssign(browserWindow, apiUrlGet(url))
  }
  const selectionIsAvailable = (candidate: LoginMethodSelection) => {
    if (candidate.method === "mfa") return true
    return loginMethodsGet(bootstrap.get()).some((item) => {
      if (item.selection.method !== candidate.method) return false
      if (item.selection.method !== "identity_provider" || candidate.method !== "identity_provider") return true
      return item.selection.identityProviderId === candidate.identityProviderId
    })
  }

  const routeSet = (next: LoginMethodSelection | undefined, replace = false, preserveCandidate = false) => {
    if (passwordChangeRequired.get()) return
    if (!preserveCandidate) lastUsedCandidateClear()
    selection.set(next)
    emailOtp.reset()
    password.reset()
    passkey.reset()
    error.set("")
    notice.set("")
    const search = flowHandle.get() ? `?flow=${flowHandle.get()}` : browserWindow.location.search
    browserHistoryNavigate(browserWindow, loginRoutePathGet(next, search), replace)
    if (next) preference.schedule(next, identifierGet(next))
    if (next?.method === "email_otp") {
      void emailOtp.reenter()
      emailOtp.emailFocus()
    } else if (next?.method === "password") {
      password.identifierFocus()
    } else if (next?.method === "passkey") {
      passkey.identifierFocus()
    } else {
      focusState.focusHeading()
    }
  }

  const selectAccount = async (accountId: string) => {
    if (busy.get()) return
    lastUsedCandidateClear()
    busy.set(true)
    error.set("")

    const res = await sessionV2ContinueApiRequest(apiOrigin(), flowHandle.get(), {
      accountId,
      csrfToken: csrfToken.get(),
    })
    busy.set(false)

    if (!res.success) {
      recentAccounts.set(recentAccounts.get().filter((acc) => acc.id !== accountId))
      failureSet(res.errorMessage)
      return
    }

    const transition = res.data
    if (transition.kind === "fallback") {
      fallbackContinue(transition.path)
      return
    }
    if (transition.kind === "complete") {
      statusContinue(transition.path)
      return
    }
    if (transition.kind === "render") {
      csrfToken.set(transition.csrfToken)
      if (transition.screen.name === "email_otp_start") {
        if (transition.screen.recentAccounts) {
          recentAccounts.set(transition.screen.recentAccounts)
        }
        if (transition.screen.loginHint) {
          emailOtp.emailSet(transition.screen.loginHint)
          password.identifierSet(transition.screen.loginHint)
          passkey.identifierSet(transition.screen.loginHint)
        }
      }
      const routeRes = loginRouteRead(transition.route)
      const nextSel = routeRes.success ? routeRes.data : { method: "email_otp" as const }
      routeSet(nextSel)
    }
  }

  const emailOtp = emailOtpStateCreate({
    apiOrigin,
    busy,
    csrfToken,
    flowHandle,
    errorClear: () => error.set(""),
    failureSet,
    fallbackContinue,
    lastUsedSave: lastUsedPrimarySave,
    notice,
    preferenceSave: (identifier) => {
      const selected = selection.get()
      if (selected) preference.save(selected, identifier)
    },
    statusContinue,
    storage,
  })

  const password = passwordStateCreate({
    apiOrigin,
    busy,
    csrfToken,
    flowHandle,
    errorClear: () => error.set(""),
    failureSet,
    fallbackContinue,
    lastUsedSave: lastUsedPrimarySave,
    notice,
    preferenceSave: (identifier) => {
      const selected = selection.get()
      if (selected) preference.save(selected, identifier)
    },
    statusContinue,
    changeRequiredSet: (value) => passwordChangeRequired.set(value),
  })

  const passkey = passkeyStateCreate({
    apiOrigin,
    busy,
    csrfToken,
    flowHandle,
    errorClear: () => error.set(""),
    failureSet,
    fallbackContinue,
    lastUsedSave: lastUsedPrimarySave,
    notice,
    preferenceSave: (identifier) => {
      const selected = selection.get()
      if (selected) preference.save(selected, identifier)
    },
    statusContinue,
    credentialsGet: options?.credentialsGet,
    isSupported: options?.passkeySupported,
  })

  const identityProvider = identityProviderStateCreate({
    apiOrigin,
    busy,
    csrfToken: csrfToken.get,
    flowHandle: flowHandle.get,
    provider: selectedIdentityProvider,
    subroute: selectedSubroute,
    errorClear: () => error.set(""),
    failureSet,
    fallbackContinue,
    lastUsedSave: lastUsedPrimarySave,
    statusContinue,
    preferenceSave: () => {
      const selected = selection.get()
      if (selected) preference.save(selected, "")
    },
    browserWindow,
  })

  onMount(() => {
    const popstate = () => {
      if (passwordChangeRequired.get()) {
        browserHistoryNavigate(browserWindow, loginRoutePathGet(selection.get(), `?flow=${flowHandle.get()}`), true)
        return
      }
      if (passwordRecoveryRouteRead(browserWindow.location.pathname)) {
        browserLocationAssign(browserWindow, browserWindow.location.pathname)
        return
      }
      const route = loginRouteRead(browserWindow.location.pathname)
      const routeAvailable = route.success && (!route.data || selectionIsAvailable(route.data)) ? route.data : undefined
      if (routeAvailable?.method !== "mfa") lastUsedCandidateClear()
      selection.set(routeAvailable)
      emailOtp.reset()
      password.reset()
      passkey.reset()
      error.set("")
      notice.set("")
      if (routeAvailable?.method === "email_otp") {
        void emailOtp.reenter()
        emailOtp.emailFocus()
      } else if (routeAvailable?.method === "password") {
        password.identifierFocus()
      } else if (routeAvailable?.method === "passkey") {
        passkey.identifierFocus()
      } else {
        focusState.focusHeading()
      }
    }
    browserWindow.addEventListener("popstate", popstate)
    onCleanup(() => browserWindow.removeEventListener("popstate", popstate))
  })

  onMount(() => {
    void (async () => {
      const recovery = passwordRecoveryRouteRead(browserWindow.location.pathname)
      if (recovery) {
        recoveryRoute.set(recovery)
        status.set("password_recovery")
        const brandingResult = await bootstrapApiRequest(apiOrigin())
        if (brandingResult.success) bootstrap.set(brandingResult.data)
        return
      }

      const urlResult = browserUrlRead(browserWindow)
      if (!urlResult.success) {
        browserHistoryNavigate(browserWindow, "/login", true)
        status.set("fatal")
        failureSet("Could not read current browser URL.")
        return
      }
      const currentFlow = flowHandleRead(urlResult.data)

      const initResult = await appInitializationStart(apiOrigin(), urlResult.data, preference.initialize)
      if (!initResult.success) {
        if (currentFlow.success && currentFlow.data) lastUsedCandidateClear(currentFlow.data)
        browserHistoryNavigate(browserWindow, "/login", true)
        status.set("fatal")
        failureSet(initResult.errorMessage)
        return
      }

      const data = initResult.data
      if (data.status === "fatal") {
        if (currentFlow.success && currentFlow.data) lastUsedCandidateClear(currentFlow.data)
        browserHistoryNavigate(browserWindow, "/login", true)
        status.set("fatal")
        failureSet(data.errorMessage)
        return
      }
      if (data.status === "fallback") {
        lastUsedCandidateClearFromPath(data.fallbackUrl)
        statusContinue(data.fallbackUrl)
        return
      }
      if (data.status === "continue") {
        if (data.flowHandle) flowHandle.set(data.flowHandle)
        if (data.organizationId) lastUsedInitialize(data.organizationId)
        statusContinue(data.continuationUrl)
        return
      }

      csrfToken.set(data.csrfToken)
      flowHandle.set(data.flowHandle)
      bootstrap.set(data.bootstrap)
      lastUsedInitialize(data.bootstrap.organization.id)
      if (data.routeSelection?.method === "identity_provider" && data.routeSelection.subroute) {
        lastUsedCandidateClear(data.flowHandle)
      }
      if (data.recentAccounts) recentAccounts.set(data.recentAccounts)
      passwordChangeRequired.set(data.passwordChangeRequired)
      totpSetupUnavailable.set(data.totpSetupUnavailable)
      emailOtpCodePending.set(data.emailOtpCodePending)
      emailOtpEnrollmentPending.set(data.emailOtpEnrollmentPending)
      webAuthnEnrollmentPending.set(data.webAuthnEnrollmentPending)
      webAuthnSetupUnavailable.set(data.webAuthnSetupUnavailable)
      if (data.notice) notice.set(data.notice)
      emailOtp.stepSet(data.emailStep)
      if (data.passkeyOptions) {
        const parsedPasskey = passkeyOptionsParse(data.passkeyOptions)
        if (parsedPasskey.success) {
          passkey.optionsSet(parsedPasskey.data)
        }
      }
      if (data.storedIdentifier) {
        emailOtp.emailSet(data.storedIdentifier)
        password.identifierSet(data.storedIdentifier)
        passkey.identifierSet(data.storedIdentifier)
      } else if (data.loginHint) {
        emailOtp.emailSet(data.loginHint)
        password.identifierSet(data.loginHint)
        passkey.identifierSet(data.loginHint)
      }

      const nextSelection = data.passwordChangeRequired
        ? ({ method: "password" } as const)
        : data.emailOtpCodePending
          ? ({ method: "mfa", factor: "email_otp" } as const)
          : data.routeSelection
      const targetSelection = nextSelection && selectionIsAvailable(nextSelection) ? nextSelection : undefined
      selection.set(targetSelection)
      browserHistoryNavigate(browserWindow, loginRoutePathGet(targetSelection, `?flow=${data.flowHandle}`), true)
      status.set("ready")
    })()
  })

  return {
    status: status.get,
    recoveryRoute: recoveryRoute.get,
    passwordRecoveryAvailable: createMemo(() => bootstrap.get().capabilities.passwordRecovery),
    passwordRecoveryStart: () => {
      browserLocationAssign(browserWindow, "/password/forgot")
    },
    loginReturn: () => {
      browserLocationAssign(browserWindow, "/login")
    },
    focusHeading: focusState.focusHeading,
    bootstrap: bootstrap.get,
    selection: selection.get,
    error: error.get,
    notice: notice.get,
    busy: busy.get,
    busySet: busy.set,
    flowHandle: flowHandle.get,
    csrfToken: csrfToken.get,
    csrfTokenSet: csrfToken.set,
    statusContinue,
    lastUsedPrimarySave,
    lastUsedMfaSave,
    lastUsedMethods: lastUsedMethods.get,
    errorClear: () => error.set(""),
    failureSet,
    fallbackContinue,
    routeSet: (next: LoginMethodSelection | undefined, replace?: boolean) =>
      routeSet(next, replace, next?.method === "mfa"),
    recentAccounts: recentAccounts.get,
    totpSetupUnavailable: totpSetupUnavailable.get,
    emailOtpCodePending: emailOtpCodePending.get,
    emailOtpEnrollmentPending: emailOtpEnrollmentPending.get,
    webAuthnEnrollmentPending: webAuthnEnrollmentPending.get,
    webAuthnSetupUnavailable: webAuthnSetupUnavailable.get,
    passwordChangeRequired: passwordChangeRequired.get,
    passwordChangeTransitionApply: (route: string) => {
      passwordChangeRequired.set(undefined)
      const routeRes = loginRouteRead(new URL(route, browserWindow.location.origin).pathname)
      routeSet(routeRes.success ? routeRes.data : undefined, true, routeRes.success)
    },
    selectAccount,
    methods,
    selectedIdentityProvider,
    selectedSubroute,
    identityProviderProviderName: identityProvider.providerName,
    identityProviderProviderType: identityProvider.providerType,
    identityProviderSubmit: identityProvider.submit,
    preferredTheme: branding.preferredTheme,
    effectiveTheme: branding.effectiveTheme,
    themeSwitchable: branding.themeSwitchable,
    brandAssetUrl: branding.brandAssetUrl,
    brandAssetFail: branding.brandAssetFail,
    themeSelect: branding.themeSelect,
    rememberIdentifier: preference.rememberIdentifier,
    emailStep: emailOtp.step,
    email: emailOtp.email,
    code: emailOtp.code,
    emailValid: emailOtp.valid,
    maskedEmail: emailOtp.maskedEmail,
    selectMethod: (next: LoginMethodSelection) => routeSet(next),
    showChooser: () => routeSet(undefined),
    emailInput: (value: string) => {
      emailOtp.emailInput(value)
      const selected = selection.get()
      if (selected) preference.schedule(selected, value)
    },
    codeInput: (value: string) => {
      emailOtp.codeInput(value)
    },
    rememberIdentifierChange: (event: Event & { currentTarget: HTMLInputElement }) => {
      const target = (event.currentTarget ?? event.target) as HTMLInputElement
      if (target) {
        const currentSelection = selection.get()
        const currentIdentifier = currentSelection ? identifierGet(currentSelection) : ""
        preference.rememberIdentifierChange(target.checked, currentSelection, currentIdentifier)
      }
    },
    emailInputRegister: emailOtp.emailInputRegister,
    codeInputRegister: emailOtp.codeInputRegister,
    headingRegister: focusState.headingRegister,
    errorRegister: focusState.errorRegister,
    emailSubmit: emailOtp.emailSubmit,
    codeSubmit: emailOtp.codeSubmit,
    resend: emailOtp.resend,
    resendAllowed: emailOtp.resendAllowed,
    resendCountdown: emailOtp.resendCountdown,
    emailChange: emailOtp.emailChange,
    passwordIdentifier: password.identifier,
    passwordValue: password.password,
    passwordShow: password.showPassword,
    passwordMfaRequired: password.mfaRequired,
    passwordValid: password.valid,
    passwordInput: (value: string) => {
      password.passwordInput(value)
    },
    passwordIdentifierInput: (value: string) => {
      password.identifierInput(value)
      const selected = selection.get()
      if (selected) preference.schedule(selected, value)
    },
    passwordToggleShow: password.toggleShowPassword,
    passwordIdentifierInputRegister: password.identifierInputRegister,
    passwordInputRegister: password.passwordInputRegister,
    passwordSubmit: password.submit,
    passkeyIdentifier: passkey.identifier,
    passkeyOptions: passkey.options,
    passkeyMfaRequired: passkey.mfaRequired,
    passkeyIsSupported: passkey.isSupported,
    passkeyIdentifierInput: (value: string) => {
      passkey.identifierInput(value)
      const selected = selection.get()
      if (selected) preference.schedule(selected, value)
    },
    passkeyIdentifierInputRegister: passkey.identifierInputRegister,
    passkeySubmit: passkey.submit,
    unsupportedSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      const selected = selection.get()
      if (selected) preference.save(selected, "")
      fallbackContinue()
    },
  }
}
