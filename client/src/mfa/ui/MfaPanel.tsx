import { For, Match, Show, Switch } from "solid-js"
import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { mfaFactorDetailGet } from "../model/mfaFactorDetailGet"
import { mfaFactorLabelGet } from "../model/mfaFactorLabelGet"
import type { MfaOptions } from "../model/mfaOptionsSchema"
import { MfaEmailOtpPanel } from "./MfaEmailOtpPanel"
import { MfaSmsOtpPanel } from "./MfaSmsOtpPanel"
import { MfaTotpPanel } from "./MfaTotpPanel"
import { MfaU2fPanel } from "./MfaU2fPanel"
import type { PasskeyCredentialsGet } from "./mfaU2fStateCreate"
import { mfaStateCreate } from "./mfaStateCreate"

type MfaPanelProps = {
  apiOrigin: () => string
  flowHandle: () => string
  csrfToken?: () => string
  csrfTokenSet?: (token: string) => void
  selection: () => LoginMethodSelection | undefined
  busy: () => boolean
  busySet?: (value: boolean) => void
  headingRegister: (element: HTMLHeadingElement) => void
  errorClear: () => void
  failureSet: (message: string) => void
  fallbackContinue: (path?: string) => void
  statusContinue?: (url: string) => void
  routeSet: (next: LoginMethodSelection | undefined, replace?: boolean) => void
  credentialsGet?: PasskeyCredentialsGet
  isSupported?: boolean
  fetchFn?: typeof fetch
}

export function MfaPanel(props: MfaPanelProps) {
  const selectedFactor = () => {
    const sel = props.selection()
    if (sel?.method !== "mfa") return undefined
    return sel.factor
  }

  const state = mfaStateCreate({
    apiOrigin: props.apiOrigin,
    flowHandle: props.flowHandle,
    csrfToken: props.csrfToken,
    csrfTokenSet: props.csrfTokenSet,
    selectedFactor,
    busy: props.busy,
    busySet: props.busySet,
    errorClear: props.errorClear,
    failureSet: props.failureSet,
    fallbackContinue: props.fallbackContinue,
    statusContinue: props.statusContinue,
    routeSet: props.routeSet,
    fetchFn: props.fetchFn,
  })

  const checkOptions = () => {
    const opt = state.options()
    return opt?.mode === "check" ? (opt as Extract<MfaOptions, { mode: "check" }>) : undefined
  }
  const selectOptions = () => {
    const opt = state.options()
    return opt?.mode === "select" ? (opt as Extract<MfaOptions, { mode: "select" }>) : undefined
  }
  const enrollOptions = () => {
    const opt = state.options()
    return opt?.mode === "enroll" ? (opt as Extract<MfaOptions, { mode: "enroll" }>) : undefined
  }
  const skipOptions = () => {
    const opt = state.options()
    return opt?.mode === "skip" ? (opt as Extract<MfaOptions, { mode: "skip" }>) : undefined
  }
  const fallbackOptions = () => {
    const opt = state.options()
    return opt?.mode === "fallback" ? (opt as Extract<MfaOptions, { mode: "fallback" }>) : undefined
  }

  return (
    <section aria-labelledby="login-title">
      <Switch>
        <Match when={state.loading()}>
          <div class="loading-state" role="status">
            <span class="spinner" aria-hidden="true" />
            <p>Loading 2-step verification options...</p>
          </div>
        </Match>
        <Match when={!state.options()}>
          <div class="intro">
            <p class="step">2-Step Verification</p>
            <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
              2-Step Verification
            </h1>
          </div>
          <button class="primary" type="button" onClick={() => void state.reload()} disabled={props.busy()}>
            Retry loading options
          </button>
          <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
            Back to methods
          </button>
        </Match>
        <Match when={state.options()}>
          <Switch>
            <Match when={selectedFactor()}>
              {(factorType) => (
                <Switch>
                  <Match when={factorType() === "totp"}>
                    <MfaTotpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showChooser={selectOptions() || enrollOptions() || skipOptions() ? state.showChooser : undefined}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={factorType() === "email_otp"}>
                    <MfaEmailOtpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showChooser={selectOptions() || enrollOptions() || skipOptions() ? state.showChooser : undefined}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={factorType() === "sms_otp"}>
                    <MfaSmsOtpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showChooser={selectOptions() || enrollOptions() || skipOptions() ? state.showChooser : undefined}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={factorType() === "u2f" || factorType() === "passkey"}>
                    <MfaU2fPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      factorType={() => factorType() as "u2f" | "passkey"}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showChooser={selectOptions() || enrollOptions() || skipOptions() ? state.showChooser : undefined}
                      showRootChooser={state.showRootChooser}
                      credentialsGet={props.credentialsGet}
                      isSupported={props.isSupported}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match
                    when={
                      factorType() !== "totp" &&
                      factorType() !== "email_otp" &&
                      factorType() !== "sms_otp" &&
                      factorType() !== "u2f" &&
                      factorType() !== "passkey"
                    }
                  >
                    <div>
                      <div class="intro">
                        <p class="step">2-Step Verification</p>
                        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                          {mfaFactorLabelGet(factorType())}
                        </h1>
                      </div>
                      <p class="mfa-placeholder-notice">
                        Verification with {mfaFactorLabelGet(factorType())} will be completed in the next update.
                      </p>
                      <button
                        class="primary"
                        type="button"
                        onClick={() => props.fallbackContinue()}
                        disabled={props.busy()}
                      >
                        Continue in ZITADEL
                      </button>
                      <Show when={selectOptions() || enrollOptions() || skipOptions()}>
                        <button class="back-button" type="button" onClick={state.showChooser} disabled={props.busy()}>
                          Back to 2-step choices
                        </button>
                      </Show>
                      <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                        Back to methods
                      </button>
                    </div>
                  </Match>
                </Switch>
              )}
            </Match>

            <Match when={checkOptions()}>
              {(check) => (
                <Switch>
                  <Match when={check().method.type === "totp"}>
                    <MfaTotpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={check().method.type === "email_otp"}>
                    <MfaEmailOtpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={check().method.type === "sms_otp"}>
                    <MfaSmsOtpPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showRootChooser={state.showRootChooser}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match when={check().method.type === "u2f" || check().method.type === "passkey"}>
                    <MfaU2fPanel
                      apiOrigin={props.apiOrigin}
                      flowHandle={props.flowHandle}
                      factorType={() => check().method.type as "u2f" | "passkey"}
                      csrfToken={props.csrfToken ?? (() => "")}
                      csrfTokenSet={props.csrfTokenSet ?? (() => undefined)}
                      busy={props.busy}
                      busySet={props.busySet ?? (() => undefined)}
                      headingRegister={props.headingRegister}
                      errorClear={props.errorClear}
                      failureSet={props.failureSet}
                      fallbackContinue={props.fallbackContinue}
                      statusContinue={props.statusContinue ?? (() => undefined)}
                      optionsReload={state.reload}
                      showRootChooser={state.showRootChooser}
                      credentialsGet={props.credentialsGet}
                      isSupported={props.isSupported}
                      fetchFn={props.fetchFn}
                    />
                  </Match>
                  <Match
                    when={
                      check().method.type !== "totp" &&
                      check().method.type !== "email_otp" &&
                      check().method.type !== "sms_otp" &&
                      check().method.type !== "u2f" &&
                      check().method.type !== "passkey"
                    }
                  >
                    <div>
                      <div class="intro">
                        <p class="step">2-Step Verification</p>
                        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                          {mfaFactorLabelGet(check().method.type)}
                        </h1>
                      </div>
                      <p class="mfa-placeholder-notice">
                        Verification with {mfaFactorLabelGet(check().method.type)} will be completed in the next update.
                      </p>
                      <button
                        class="primary"
                        type="button"
                        onClick={() => props.fallbackContinue()}
                        disabled={props.busy()}
                      >
                        Continue in ZITADEL
                      </button>
                      <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                        Back to methods
                      </button>
                    </div>
                  </Match>
                </Switch>
              )}
            </Match>

            <Match when={selectOptions()}>
              {(select) => (
                <div>
                  <div class="intro">
                    <p class="step">2-Step Verification</p>
                    <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                      Choose 2-step verification method
                    </h1>
                  </div>
                  <ul class="method-list">
                    <For each={select().methods}>
                      {(method) => (
                        <li>
                          <button
                            class="method-button"
                            type="button"
                            disabled={props.busy()}
                            onClick={() => state.selectFactor(method.type)}
                          >
                            <span>{mfaFactorLabelGet(method.type)}</span>
                            <small>{mfaFactorDetailGet(method.type)}</small>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                    Back to methods
                  </button>
                </div>
              )}
            </Match>

            <Match when={enrollOptions()}>
              {(enroll) => (
                <div>
                  <div class="intro">
                    <p class="step">2-Step Verification</p>
                    <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                      Set up 2-step verification
                    </h1>
                  </div>
                  <p class="mfa-mode-description">Select a method to set up 2-step verification for your account.</p>
                  <ul class="method-list">
                    <For each={enroll().methods}>
                      {(method) => (
                        <li>
                          <button
                            class="method-button"
                            type="button"
                            disabled={props.busy()}
                            onClick={() => state.selectFactor(method.type)}
                          >
                            <span>Set up {mfaFactorLabelGet(method.type)}</span>
                            <small>{mfaFactorDetailGet(method.type)}</small>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                    Back to methods
                  </button>
                </div>
              )}
            </Match>

            <Match when={skipOptions()}>
              {(skip) => (
                <div>
                  <Switch>
                    <Match when={skip().reason === "factor_satisfied"}>
                      <div class="intro">
                        <p class="step">2-Step Verification</p>
                        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                          2-Step verification satisfied
                        </h1>
                      </div>
                      <p class="mfa-mode-description">Your sign-in already satisfies 2-step verification policy.</p>
                      <button
                        class="primary"
                        type="button"
                        onClick={() => props.fallbackContinue()}
                        disabled={props.busy()}
                      >
                        Continue sign-in
                      </button>
                    </Match>
                    <Match when={skip().reason === "optional_setup"}>
                      <div class="intro">
                        <p class="step">2-Step Verification</p>
                        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                          Optional 2-step verification
                        </h1>
                      </div>
                      <p class="mfa-mode-description">
                        You can set up 2-step verification for extra security or skip for now.
                      </p>
                      <Show when={skip().methods.length > 0}>
                        <ul class="method-list">
                          <For each={skip().methods}>
                            {(method) => (
                              <li>
                                <button
                                  class="method-button"
                                  type="button"
                                  disabled={props.busy()}
                                  onClick={() => state.selectFactor(method.type)}
                                >
                                  <span>Set up {mfaFactorLabelGet(method.type)}</span>
                                  <small>{mfaFactorDetailGet(method.type)}</small>
                                </button>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                      <button class="secondary-button" type="button" onClick={state.skipSubmit} disabled={props.busy()}>
                        {props.busy() ? "Skipping..." : "Skip for now"}
                      </button>
                    </Match>
                  </Switch>
                  <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                    Back to methods
                  </button>
                </div>
              )}
            </Match>

            <Match when={fallbackOptions()}>
              {(fb) => (
                <div>
                  <div class="intro">
                    <p class="step">2-Step Verification</p>
                    <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
                      2-Step verification required
                    </h1>
                  </div>
                  <p class="mfa-mode-description">
                    {fb().reason === "recovery_code"
                      ? "Recovery code verification requires native ZITADEL sign-in."
                      : "This 2-step verification option requires native ZITADEL sign-in."}
                  </p>
                  <button
                    class="primary"
                    type="button"
                    onClick={() => props.fallbackContinue()}
                    disabled={props.busy()}
                  >
                    Continue in ZITADEL
                  </button>
                  <button class="back-button" type="button" onClick={state.showRootChooser} disabled={props.busy()}>
                    Back to methods
                  </button>
                </div>
              )}
            </Match>
          </Switch>
        </Match>
      </Switch>
    </section>
  )
}
