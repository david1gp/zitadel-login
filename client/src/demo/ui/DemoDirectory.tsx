import { For } from "solid-js"

import { MethodChoiceButton } from "../../flow/ui/MethodChoiceButton"
import { ttc } from "../../i18n/model/ttc"
import { classesDemoDirectoryGroup } from "../../ui/classes/classesDemoDirectoryGroup"
import { classesDemoDirectoryList } from "../../ui/classes/classesDemoDirectoryList"
import { classesHeading } from "../../ui/classes/classesHeading"
import { classesIntro } from "../../ui/classes/classesIntro"
import { classesIntroCopy } from "../../ui/classes/classesIntroCopy"
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
        <h1 ref={props.headingRegister} id="login-title" tabindex="-1" class={classesHeading}>
          {ttc("Screen directory")}
        </h1>
        <p class={classesIntroCopy}>{ttc("Open any login screen with fake data. Actions stay inside /demo.")}</p>
      </div>
      <For each={groups()}>
        {(group) => (
          <section class={classesDemoDirectoryGroup}>
            <h2>{ttc(group.group)}</h2>
            <ul class={classesDemoDirectoryList}>
              <For each={group.scenarios}>
                {(scenario) => (
                  <li>
                    <MethodChoiceButton
                      label={ttc(scenario.label)}
                      detail={ttc(scenario.detail)}
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
