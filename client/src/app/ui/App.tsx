import { Match, Show, Switch } from "solid-js"

import { BrandHeader } from "../../branding/ui/BrandHeader"
import { EmailOtpPanel } from "../../email-otp/ui/EmailOtpPanel"
import { MethodChooser } from "../../flow/ui/MethodChooser"
import { IdentityProviderPanel } from "../../identity-provider/ui/IdentityProviderPanel"
import { MfaPanel } from "../../mfa/ui/MfaPanel"
import { PasskeyPanel } from "../../passkey/ui/PasskeyPanel"
import { PasswordChangeRequiredPanel } from "../../password/ui/PasswordChangeRequiredPanel"
import { PasswordPanel } from "../../password/ui/PasswordPanel"
import { PasswordRecoveryRequestPanel } from "../../password-recovery/ui/PasswordRecoveryRequestPanel"
import { PasswordResetPanel } from "../../password-recovery/ui/PasswordResetPanel"
import { classesCardTop } from "../../ui/classes/classesCardTop"
import { classesContent } from "../../ui/classes/classesContent"
import { classesErrorMessage } from "../../ui/classes/classesErrorMessage"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesLoadingState } from "../../ui/classes/classesLoadingState"
import { classesNoticeMessage } from "../../ui/classes/classesNoticeMessage"
import { classesOrganizationName } from "../../ui/classes/classesOrganizationName"
import { classesPageShell } from "../../ui/classes/classesPageShell"
import { classesSpinner } from "../../ui/classes/classesSpinner"
import { LoginFrame } from "../../ui/LoginFrame"
import { pageBackgroundStyleGet } from "../../ui/styles/pageBackgroundStyleGet"
import { pageBackgroundScreenFromAppGet } from "../model/pageBackgroundScreenFromAppGet"
import { appStateCreate } from "./appStateCreate"

type AppProps = { apiOrigin: string }

export function App(props: AppProps) {
  const state = appStateCreate(() => props.apiOrigin)

  return (
    <main
      class={classesPageShell}
      style={pageBackgroundStyleGet(
        pageBackgroundScreenFromAppGet({
          status: state.status(),
          recoveryRoute: state.recoveryRoute(),
          passwordChangeRequired: Boolean(state.passwordChangeRequired()),
          selection: state.selection(),
        }),
      )}
    >
      <LoginFrame
        busy={state.busy}
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
          <Switch>
            <Match when={state.status() === "password_recovery" && state.recoveryRoute() === "request"}>
              <PasswordRecoveryRequestPanel
                apiOrigin={() => props.apiOrigin}
                errorClear={state.errorClear}
                failureSet={state.failureSet}
                focusHeading={state.focusHeading}
                headingRegister={state.headingRegister}
                showLogin={state.loginReturn}
              />
            </Match>
            <Match when={state.status() === "password_recovery" && state.recoveryRoute() === "reset"}>
              <PasswordResetPanel
                apiOrigin={() => props.apiOrigin}
                errorClear={state.errorClear}
                failureSet={state.failureSet}
                focusHeading={state.focusHeading}
                headingRegister={state.headingRegister}
                showLogin={state.loginReturn}
              />
            </Match>
            <Match when={state.status() === "loading" || state.status() === "continuing"}>
              <div class={classesLoadingState} role="status">
                <span class={classesSpinner} aria-hidden="true" />
                <h1 ref={state.headingRegister} id="login-title" tabindex="-1">
                  {state.status() === "continuing" ? "Continuing sign-in..." : "Loading sign-in..."}
                </h1>
              </div>
            </Match>
            <Match when={state.status() === "fatal"}>
              <div class={classesIntro}>
                <h1 ref={state.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
                  Start sign-in again
                </h1>
              </div>
            </Match>
            <Match when={state.status() === "ready" && state.passwordChangeRequired()}>
              {(change) => (
                <PasswordChangeRequiredPanel
                  apiOrigin={() => props.apiOrigin}
                  flowHandle={state.flowHandle}
                  csrfToken={state.csrfToken}
                  csrfTokenSet={state.csrfTokenSet}
                  expired={() => change().expired}
                  busy={state.busy}
                  busySet={state.busySet}
                  headingRegister={state.headingRegister}
                  errorClear={state.errorClear}
                  failureSet={state.failureSet}
                  fallbackContinue={state.fallbackContinue}
                  statusContinue={state.statusContinue}
                  transitionApply={state.passwordChangeTransitionApply}
                />
              )}
            </Match>
            <Match when={state.status() === "ready" && !state.selection()}>
              <MethodChooser
                methods={state.methods}
                select={state.selectMethod}
                headingRegister={state.headingRegister}
                recentAccounts={state.recentAccounts}
                selectAccount={state.selectAccount}
                busy={state.busy}
              />
            </Match>
            <Match when={state.status() === "ready" && state.selection()?.method === "email_otp"}>
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
            <Match when={state.status() === "ready" && state.selection()?.method === "password"}>
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
            <Match when={state.status() === "ready" && state.selection()?.method === "passkey"}>
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
            <Match when={state.status() === "ready" && state.selection()?.method === "identity_provider"}>
              <IdentityProviderPanel
                providerName={state.identityProviderProviderName}
                providerType={state.identityProviderProviderType}
                subroute={state.selectedSubroute}
                busy={state.busy}
                headingRegister={state.headingRegister}
                submit={state.identityProviderSubmit}
                showChooser={state.showChooser}
              />
            </Match>
            <Match when={state.status() === "ready" && state.selection()?.method === "mfa"}>
              <MfaPanel
                apiOrigin={() => props.apiOrigin}
                flowHandle={state.flowHandle}
                csrfToken={state.csrfToken}
                csrfTokenSet={state.csrfTokenSet}
                selection={state.selection}
                busy={state.busy}
                busySet={state.busySet}
                headingRegister={state.headingRegister}
                errorClear={state.errorClear}
                failureSet={state.failureSet}
                fallbackContinue={state.fallbackContinue}
                statusContinue={state.statusContinue}
                routeSet={state.routeSet}
                totpSetupUnavailable={state.totpSetupUnavailable}
                emailOtpCodePending={state.emailOtpCodePending}
                webAuthnSetupUnavailable={state.webAuthnSetupUnavailable}
              />
            </Match>
          </Switch>
          <Show when={state.error()}>
            <div ref={state.errorRegister} id="error-message" class={classesErrorMessage} role="alert" tabindex="-1">
              {state.error()}
            </div>
          </Show>
          <Show when={state.notice() && state.emailStep() !== "code"}>
            <p class={classesNoticeMessage} role="status">
              {state.notice()}
            </p>
          </Show>
        </div>
      </LoginFrame>
    </main>
  )
}
