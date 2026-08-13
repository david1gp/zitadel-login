import { Match, Show, Switch } from "solid-js"

import { BrandHeader } from "../../branding/ui/BrandHeader"
import { EmailOtpPanel } from "../../email-otp/ui/EmailOtpPanel"
import { MethodChooser } from "../../flow/ui/MethodChooser"
import { UnsupportedMethodPanel } from "../../flow/ui/UnsupportedMethodPanel"
import { IdentityProviderPanel } from "../../identity-provider/ui/IdentityProviderPanel"
import { MfaPanel } from "../../mfa/ui/MfaPanel"
import { PasskeyPanel } from "../../passkey/ui/PasskeyPanel"
import { PasswordChangeRequiredPanel } from "../../password/ui/PasswordChangeRequiredPanel"
import { PasswordPanel } from "../../password/ui/PasswordPanel"
import { PasswordRecoveryRequestPanel } from "../../password-recovery/ui/PasswordRecoveryRequestPanel"
import { PasswordResetPanel } from "../../password-recovery/ui/PasswordResetPanel"
import { ThemeToggle } from "../../preferences/ui/ThemeToggle"
import { classesCardTop } from "../../ui/classes/classesCardTop"
import { classesContent } from "../../ui/classes/classesContent"
import { classesDemoScenarioMeta } from "../../ui/classes/classesDemoScenarioMeta"
import { classesDemoShell } from "../../ui/classes/classesDemoShell"
import { classesDemoStage } from "../../ui/classes/classesDemoStage"
import { classesErrorMessage } from "../../ui/classes/classesErrorMessage"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLoadingState } from "../../ui/classes/classesLoadingState"
import { classesLoginCard } from "../../ui/classes/classesLoginCard"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesPageShell } from "../../ui/classes/classesPageShell"
import { classesSpinner } from "../../ui/classes/classesSpinner"
import { classesStep } from "../../ui/classes/classesStep"
import { classMerge } from "../../ui/classMerge"
import { DemoDirectory } from "./DemoDirectory"
import { DemoNav } from "./DemoNav"
import { demoAppStateCreate } from "./demoAppStateCreate"

export function DemoApp() {
  const state = demoAppStateCreate()
  const id = () => state.scenario().id

  return (
    <div class={classesDemoShell} data-chrome={state.chrome()}>
      <DemoNav
        chrome={state.chrome}
        chromeSelect={state.chromeSelect}
        query={state.query}
        queryInput={state.queryInput}
        pickerOpen={state.pickerOpen}
        pickerToggle={state.pickerToggle}
        scenarios={state.filteredScenarios}
        currentId={id}
        open={state.scenarioOpen}
        previousOpen={state.previousOpen}
        nextOpen={state.nextOpen}
        hasPrevious={state.hasPrevious}
        hasNext={state.hasNext}
        showDirectory={state.showDirectory}
      />
      <main class={classMerge(classesPageShell, classesDemoStage)}>
        <section class={classesLoginCard} aria-busy={state.busy()}>
          <div class={classesCardTop}>
            <BrandHeader
              assetUrl={state.brandAssetUrl}
              name={() => state.bootstrap().organization.name}
              onAssetError={state.brandAssetFail}
            />
            <ThemeToggle
              preference={state.preferredTheme}
              switchable={state.themeSwitchable}
              select={state.themeSelect}
            />
          </div>
          <div class={classesContent}>
            <p class={classesDemoScenarioMeta}>
              {state.scenario().group} · {state.scenario().label}
            </p>
            <Show when={id()} keyed>
              {(scenarioId) => (
                <Switch>
                  <Match when={scenarioId === "directory"}>
                    <DemoDirectory
                      scenarios={state.filteredScenarios}
                      currentId={id}
                      open={state.scenarioOpen}
                      headingRegister={state.headingRegister}
                    />
                  </Match>
                  <Match when={scenarioId === "loading" || scenarioId === "continuing"}>
                    <div class={classesLoadingState} role="status">
                      <span class={classesSpinner} aria-hidden="true" />
                      <h1 ref={state.headingRegister} id="login-title" tabindex="-1">
                        {scenarioId === "continuing" ? "Continuing sign-in..." : "Loading sign-in..."}
                      </h1>
                    </div>
                  </Match>
                  <Match when={scenarioId === "fatal"}>
                    <div class={classesIntro}>
                      <p class={classesStep}>Unable to continue</p>
                      <h1 ref={state.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                        Start sign-in again
                      </h1>
                    </div>
                  </Match>
                  <Match when={scenarioId === "chooser" || scenarioId === "chooser-recent"}>
                    <MethodChooser
                      methods={state.methods}
                      select={state.methodSelect}
                      headingRegister={state.headingRegister}
                      recentAccounts={state.recentAccounts}
                      selectAccount={state.accountSelect}
                      busy={state.busy}
                    />
                  </Match>
                  <Match when={scenarioId === "email-otp-email" || scenarioId === "email-otp-code"}>
                    <EmailOtpPanel
                      step={state.emailStep}
                      email={state.email}
                      code={state.code}
                      busy={state.busy}
                      valid={state.emailValid}
                      maskedEmail={state.maskedEmail}
                      notice={state.notice}
                      rememberIdentifier={state.rememberIdentifier}
                      headingRegister={state.headingRegister}
                      emailInputRegister={state.emailInputRegister}
                      codeInputRegister={state.codeInputRegister}
                      emailInput={state.emailInput}
                      codeInput={state.codeInput}
                      rememberIdentifierChange={state.rememberIdentifierChange}
                      emailSubmit={state.emailSubmit}
                      codeSubmit={state.codeSubmit}
                      resend={state.resend}
                      emailChange={state.emailChange}
                      showChooser={state.showChooser}
                    />
                  </Match>
                  <Match
                    when={scenarioId === "password" || scenarioId === "password-error" || scenarioId === "password-mfa"}
                  >
                    <PasswordPanel
                      identifier={state.passwordIdentifier}
                      password={state.passwordValue}
                      showPassword={state.passwordShow}
                      mfaRequired={state.passwordMfaRequired}
                      busy={state.busy}
                      valid={state.passwordValid}
                      rememberIdentifier={state.rememberIdentifier}
                      headingRegister={state.headingRegister}
                      identifierInputRegister={state.passwordIdentifierInputRegister}
                      passwordInputRegister={state.passwordInputRegister}
                      identifierInput={state.passwordIdentifierInput}
                      passwordInput={state.passwordInput}
                      toggleShowPassword={state.passwordToggleShow}
                      rememberIdentifierChange={state.rememberIdentifierChange}
                      submit={state.passwordSubmit}
                      showChooser={state.showChooser}
                      passwordRecoveryAvailable={state.passwordRecoveryAvailable}
                      passwordRecoveryStart={state.passwordRecoveryStart}
                    />
                  </Match>
                  <Match when={scenarioId === "password-change" || scenarioId === "password-change-expired"}>
                    <PasswordChangeRequiredPanel
                      apiOrigin={state.apiOrigin}
                      flowHandle={state.flowHandle}
                      csrfToken={state.csrfToken}
                      csrfTokenSet={state.csrfTokenSet}
                      expired={state.passwordChangeExpired}
                      busy={state.busy}
                      busySet={state.busySet}
                      headingRegister={state.headingRegister}
                      errorClear={state.errorClear}
                      failureSet={state.failureSet}
                      fallbackContinue={state.fallbackContinue}
                      statusContinue={state.statusContinue}
                      transitionApply={state.passwordChangeTransitionApply}
                      fetchFn={state.fetchFn}
                    />
                  </Match>
                  <Match
                    when={
                      scenarioId === "passkey" || scenarioId === "passkey-unsupported" || scenarioId === "passkey-mfa"
                    }
                  >
                    <PasskeyPanel
                      identifier={state.passkeyIdentifier}
                      options={state.passkeyOptions}
                      mfaRequired={state.passkeyMfaRequired}
                      busy={state.busy}
                      isSupported={state.passkeyIsSupported}
                      rememberIdentifier={state.rememberIdentifier}
                      headingRegister={state.headingRegister}
                      identifierInputRegister={state.passkeyIdentifierInputRegister}
                      identifierInput={state.passkeyIdentifierInput}
                      rememberIdentifierChange={state.rememberIdentifierChange}
                      submit={state.passkeySubmit}
                      showChooser={state.showChooser}
                    />
                  </Match>
                  <Match when={scenarioId.startsWith("idp")}>
                    <IdentityProviderPanel
                      providerName={state.identityProviderProviderName}
                      providerType={state.identityProviderProviderType}
                      subroute={state.identityProviderSubroute}
                      busy={state.busy}
                      headingRegister={state.headingRegister}
                      submit={state.identityProviderSubmit}
                      showChooser={state.showChooser}
                    />
                  </Match>
                  <Match when={scenarioId.startsWith("mfa-")}>
                    <MfaPanel
                      apiOrigin={state.apiOrigin}
                      flowHandle={state.flowHandle}
                      csrfToken={state.csrfToken}
                      csrfTokenSet={state.csrfTokenSet}
                      selection={state.mfaSelection}
                      busy={state.busy}
                      busySet={state.busySet}
                      headingRegister={state.headingRegister}
                      errorClear={state.errorClear}
                      failureSet={state.failureSet}
                      fallbackContinue={state.fallbackContinue}
                      statusContinue={state.statusContinue}
                      routeSet={state.routeSet}
                      credentialsGet={state.credentialsGet}
                      credentialsCreate={state.credentialsCreate}
                      isSupported={state.mfaIsSupported()}
                      registrationIsSupported={state.mfaIsSupported()}
                      fetchFn={state.fetchFn}
                      totpSetupUnavailable={state.totpSetupUnavailable}
                      emailOtpCodePending={state.emailOtpCodePending}
                      webAuthnSetupUnavailable={state.webAuthnSetupUnavailable}
                    />
                  </Match>
                  <Match when={scenarioId.startsWith("recovery-")}>
                    <PasswordRecoveryRequestPanel
                      apiOrigin={state.apiOrigin}
                      errorClear={state.errorClear}
                      failureSet={state.failureSet}
                      focusHeading={state.focusHeading}
                      headingRegister={state.headingRegister}
                      showLogin={state.loginReturn}
                      fetchFn={state.fetchFn}
                      initialStep={state.recoveryInitialStep()}
                    />
                  </Match>
                  <Match when={scenarioId.startsWith("reset")}>
                    <PasswordResetPanel
                      apiOrigin={state.apiOrigin}
                      errorClear={state.errorClear}
                      failureSet={state.failureSet}
                      focusHeading={state.focusHeading}
                      headingRegister={state.headingRegister}
                      showLogin={state.loginReturn}
                      fetchFn={state.fetchFn}
                      initialStep={state.resetInitialStep()}
                    />
                  </Match>
                  <Match when={scenarioId === "unsupported"}>
                    <UnsupportedMethodPanel
                      method="mfa"
                      busy={state.busy}
                      headingRegister={state.headingRegister}
                      submit={(event) => {
                        event.preventDefault()
                        state.fallbackContinue()
                      }}
                      showChooser={state.showChooser}
                    />
                  </Match>
                </Switch>
              )}
            </Show>
            <Show when={state.error()}>
              <div ref={state.errorRegister} id="error-message" class={classesErrorMessage} role="alert" tabindex="-1">
                {state.error()}
              </div>
            </Show>
            <Show when={state.completed()}>
              <p class={classesNoticeMessage} role="status">
                {state.completed()}
              </p>
            </Show>
          </div>
        </section>
      </main>
    </div>
  )
}
