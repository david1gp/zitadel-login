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
import { ttc } from "../../i18n/model/ttc"
import { classesCardTop } from "../../ui/classes/classesCardTop"
import { classesContent } from "../../ui/classes/classesContent"
import { classesDemoScenarioMeta } from "../../ui/classes/classesDemoScenarioMeta"
import { classesDemoShell } from "../../ui/classes/classesDemoShell"
import { classesDemoStage } from "../../ui/classes/classesDemoStage"
import { classesErrorMessage } from "../../ui/classes/classesErrorMessage"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLoadingState } from "../../ui/classes/classesLoadingState"
import { classesDemoDirectoryCard } from "../../ui/classes/classesDemoDirectoryCard"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesOrganizationName } from "../../ui/classes/classesOrganizationName"
import { classesPageShell } from "../../ui/classes/classesPageShell"
import { classesSpinner } from "../../ui/classes/classesSpinner"
import { classMerge } from "../../ui/classMerge"
import { LoginFrame } from "../../ui/LoginFrame"
import { pageBackgroundStyleGet } from "../../ui/styles/pageBackgroundStyleGet"
import { pageBackgroundScreenFromDemoGet } from "../model/pageBackgroundScreenFromDemoGet"
import { DemoDirectory } from "./DemoDirectory"
import { DemoNav } from "./DemoNav"
import { demoAppStateCreate } from "./demoAppStateCreate"

function showScenarioMeta(id: string): boolean {
  return id === "directory"
}

export function DemoApp() {
  const state = demoAppStateCreate()
  const id = () => state.scenario().id

  return (
    <div class={classesDemoShell} data-chrome={state.chrome()}>
      <DemoNav
        chrome={state.chrome}
        chromeSelect={state.chromeSelect}
        pickerOpen={state.pickerOpen}
        pickerToggle={state.pickerToggle}
        scenarios={state.scenarios}
        currentId={id}
        open={state.scenarioOpen}
        previousOpen={state.previousOpen}
        nextOpen={state.nextOpen}
        hasPrevious={state.hasPrevious}
        hasNext={state.hasNext}
        showDirectory={state.showDirectory}
      />
      <main
        class={classMerge(classesPageShell, classesDemoStage)}
        style={pageBackgroundStyleGet(pageBackgroundScreenFromDemoGet(id()))}
      >
        <LoginFrame
          busy={state.busy}
          cardClass={id() === "directory" && classesDemoDirectoryCard}
          legal={() => state.bootstrap().legal}
          preferredTheme={state.preferredTheme}
          themeSwitchable={state.themeSwitchable}
          themeSelect={state.themeSelect}
        >
          <div class={classesCardTop}>
            <BrandHeader
              assetUrl={state.brandAssetUrl}
              name={() => state.bootstrap().organization.name}
              onAssetError={state.brandAssetFail}
            />
            <p class={classesOrganizationName}>{state.bootstrap().organization.name}</p>
          </div>
          <div class={classesContent}>
            <Show when={showScenarioMeta(id())}>
              <p class={classesDemoScenarioMeta}>
                {ttc(state.scenario().group)} · {ttc(state.scenario().label)}
              </p>
            </Show>
            <Show when={id()} keyed>
              {(scenarioId) => (
                <Switch>
                  <Match when={scenarioId === "directory"}>
                    <DemoDirectory
                      scenarios={state.scenarios}
                      currentId={id}
                      open={state.scenarioOpen}
                      headingRegister={state.headingRegister}
                    />
                  </Match>
                  <Match when={scenarioId === "loading" || scenarioId === "continuing"}>
                    <div class={classesLoadingState} role="status">
                      <span class={classesSpinner} aria-hidden="true" />
                      <h1 ref={state.headingRegister} id="login-title" tabindex="-1">
                        {scenarioId === "continuing" ? ttc("Continuing sign-in...") : ttc("Loading sign-in...")}
                      </h1>
                    </div>
                  </Match>
                  <Match when={scenarioId === "fatal"}>
                    <div class={classesIntro}>
                      <h1 ref={state.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                        {ttc("Start sign-in again")}
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
                      resendAllowed={state.resendAllowed}
                      resendCountdown={state.resendCountdown}
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
                {ttc(state.error())}
              </div>
            </Show>
            <Show when={state.completed()}>
              <p class={classesNoticeMessage} role="status">
                {ttc(state.completed())}
              </p>
            </Show>
          </div>
        </LoginFrame>
      </main>
    </div>
  )
}
