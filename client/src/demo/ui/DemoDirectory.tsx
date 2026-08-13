import { For } from "solid-js"

import { MethodChoiceButton } from "../../flow/ui/MethodChoiceButton"
import { classesDemoDirectoryGroup } from "../../ui/classes/classesDemoDirectoryGroup"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
import { classesMethodList } from "../../ui/classes/classesMethodList"
import { classesStep } from "../../ui/classes/classesStep"
import { demoScenarioGroupsGet } from "../model/demoScenarioGroupsGet"
import { demoScenarioIconPathGet } from "../model/demoScenarioIconPathGet"
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
    <section aria-labelledby="login-title">
      <div class={classesIntro}>
        <p class={classesStep}>Demo</p>
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          Screen directory
        </h1>
        <p class={classesIntroCopy}>Open any login screen with fake data. Actions stay inside /demo.</p>
      </div>
      <For each={groups()}>
        {(group) => (
          <section class={classesDemoDirectoryGroup}>
            <h2>{group.group}</h2>
            <ul class={classesMethodList}>
              <For each={group.scenarios}>
                {(scenario) => (
                  <li>
                    <MethodChoiceButton
                      label={scenario.label}
                      detail={scenario.detail}
                      iconPath={demoScenarioIconPathGet(scenario.id)}
                      current={scenario.id === props.currentId()}
                      onClick={() => props.open(scenario.path)}
                    />
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
