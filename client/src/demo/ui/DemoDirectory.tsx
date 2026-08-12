import { For } from "solid-js"

import { demoScenarioGroupsGet } from "../model/demoScenarioGroupsGet"
import type { DemoScenario } from "../model/demoScenarioSchema"

type DemoDirectoryProps = {
  scenarios: () => DemoScenario[]
  currentId: () => string
  open: (path: string) => void
  headingRegister: (element: HTMLHeadingElement) => void
}

export function DemoDirectory(props: DemoDirectoryProps) {
  const groups = () => demoScenarioGroupsGet(props.scenarios())

  return (
    <section class="demo-directory" aria-labelledby="login-title">
      <div class="intro">
        <p class="step">Demo</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1">
          Screen directory
        </h1>
        <p>Open any login screen with fake data. Actions stay inside /demo.</p>
      </div>
      <For each={groups()}>
        {(group) => (
          <section class="demo-directory-group">
            <h2>{group.group}</h2>
            <ul class="method-list">
              <For each={group.scenarios}>
                {(scenario) => (
                  <li>
                    <button
                      class="method-button"
                      type="button"
                      aria-current={scenario.id === props.currentId() ? "page" : undefined}
                      onClick={() => props.open(scenario.path)}
                    >
                      <span>{scenario.label}</span>
                      <small>{scenario.detail}</small>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </section>
  )
}
