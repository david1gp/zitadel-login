import { For, Show } from "solid-js"

import { ttc } from "../../i18n/model/ttc"
import { classesDemoChromeToggle } from "../../ui/classes/classesDemoChromeToggle"
import { classesDemoChromeToggleButton } from "../../ui/classes/classesDemoChromeToggleButton"
import { classesDemoNav } from "../../ui/classes/classesDemoNav"
import { classesDemoNavIcon } from "../../ui/classes/classesDemoNavIcon"
import { classesDemoNavKicker } from "../../ui/classes/classesDemoNavKicker"
import { classesDemoNavList } from "../../ui/classes/classesDemoNavList"
import { classesDemoNavListButton } from "../../ui/classes/classesDemoNavListButton"
import { classesDemoNavRow } from "../../ui/classes/classesDemoNavRow"
import { classesTextButton } from "../../ui/classes/classesTextButton"
import { classesVisuallyHidden } from "../../ui/classes/classesVisuallyHidden"
import { Icon } from "../../ui/Icon"
import type { DemoChrome } from "../model/demoChromeSchema"
import { demoScenarioGroupsGet } from "../model/demoScenarioGroupsGet"
import { demoScenarioIconPathGet } from "../model/demoScenarioIconPathGet"
import type { DemoScenario } from "../model/demoScenarioSchema"
import { DemoGithubLink } from "./DemoGithubLink"

type DemoNavProps = {
  chrome: () => DemoChrome
  chromeSelect: (value: DemoChrome) => void
  pickerOpen: () => boolean
  pickerToggle: () => void
  scenarios: () => DemoScenario[]
  currentId: () => string
  open: (path: string) => void
  previousOpen: () => void
  nextOpen: () => void
  hasPrevious: () => boolean
  hasNext: () => boolean
  showDirectory: () => void
}

export function DemoNav(props: DemoNavProps) {
  const groups = () => demoScenarioGroupsGet(props.scenarios())
  const compact = () => props.chrome() === "compact"

  return (
    <aside class={classesDemoNav} data-chrome={props.chrome()}>
      <div class={classesDemoNavRow}>
        <p class={classesDemoNavKicker}>{ttc("UI demo")}</p>
        <div class={classesDemoNavRow}>
          <DemoGithubLink />
          <button class={classesTextButton} type="button" onClick={props.showDirectory}>
            {ttc("Directory")}
          </button>
          <Show when={compact()}>
            <button
              class={classesTextButton}
              type="button"
              onClick={props.pickerToggle}
              aria-expanded={props.pickerOpen()}
            >
              {props.pickerOpen() ? ttc("Hide screens") : ttc("Screens")}
            </button>
          </Show>
        </div>
      </div>
      <fieldset class={classesDemoChromeToggle}>
        <legend class={classesVisuallyHidden}>{ttc("Demo chrome")}</legend>
        <button
          type="button"
          class={classesDemoChromeToggleButton}
          aria-pressed={props.chrome() === "sidebar"}
          onClick={() => props.chromeSelect("sidebar")}
        >
          {ttc("Sidebar")}
        </button>
        <button
          type="button"
          class={classesDemoChromeToggleButton}
          aria-pressed={props.chrome() === "compact"}
          onClick={() => props.chromeSelect("compact")}
        >
          {ttc("Compact")}
        </button>
      </fieldset>
      <div class={classesDemoNavRow}>
        <button class={classesTextButton} type="button" disabled={!props.hasPrevious()} onClick={props.previousOpen}>
          {ttc("Previous")}
        </button>
        <button class={classesTextButton} type="button" disabled={!props.hasNext()} onClick={props.nextOpen}>
          {ttc("Next")}
        </button>
      </div>
      <Show when={!compact() || props.pickerOpen()}>
        <nav class={classesDemoNavList} aria-label={ttc("Demo screens")}>
          <For each={groups()}>
            {(group) => (
              <section>
                <h2>{ttc(group.group)}</h2>
                <ul>
                  <For each={group.scenarios}>
                    {(scenario) => (
                      <li>
                        <button
                          type="button"
                          class={classesDemoNavListButton}
                          aria-current={scenario.id === props.currentId() ? "page" : undefined}
                          onClick={() => props.open(scenario.path)}
                        >
                          <Icon class={classesDemoNavIcon} path={demoScenarioIconPathGet(scenario.id)} />
                          <span>{ttc(scenario.label)}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </nav>
      </Show>
    </aside>
  )
}
