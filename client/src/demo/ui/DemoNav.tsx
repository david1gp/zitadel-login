import { For, Show } from "solid-js"

import { Icon } from "../../ui/Icon"
import type { DemoChrome } from "../model/demoChromeSchema"
import { demoScenarioGroupsGet } from "../model/demoScenarioGroupsGet"
import { demoScenarioIconPathGet } from "../model/demoScenarioIconPathGet"
import type { DemoScenario } from "../model/demoScenarioSchema"

type DemoNavProps = {
  chrome: () => DemoChrome
  chromeSelect: (value: DemoChrome) => void
  query: () => string
  queryInput: (value: string) => void
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
    <aside class="demo-nav" data-chrome={props.chrome()}>
      <div class="demo-nav-top">
        <p class="demo-nav-kicker">UI demo</p>
        <div class="demo-nav-actions">
          <button class="text-button" type="button" onClick={props.showDirectory}>
            Directory
          </button>
          <Show when={compact()}>
            <button class="text-button" type="button" onClick={props.pickerToggle} aria-expanded={props.pickerOpen()}>
              {props.pickerOpen() ? "Hide screens" : "Screens"}
            </button>
          </Show>
        </div>
      </div>
      <fieldset class="demo-chrome-toggle">
        <legend class="visually-hidden">Demo chrome</legend>
        <button type="button" aria-pressed={props.chrome() === "sidebar"} onClick={() => props.chromeSelect("sidebar")}>
          Sidebar
        </button>
        <button type="button" aria-pressed={props.chrome() === "compact"} onClick={() => props.chromeSelect("compact")}>
          Compact
        </button>
      </fieldset>
      <div class="demo-nav-stepper">
        <button class="text-button" type="button" disabled={!props.hasPrevious()} onClick={props.previousOpen}>
          Previous
        </button>
        <button class="text-button" type="button" disabled={!props.hasNext()} onClick={props.nextOpen}>
          Next
        </button>
      </div>
      <Show when={!compact() || props.pickerOpen()}>
        <label class="demo-search-label" for="demo-search">
          Filter screens
        </label>
        <input
          id="demo-search"
          type="search"
          value={props.query()}
          placeholder="Search screens"
          onInput={(event) => props.queryInput(event.currentTarget.value)}
        />
        <nav class="demo-nav-list" aria-label="Demo screens">
          <For each={groups()}>
            {(group) => (
              <section>
                <h2>{group.group}</h2>
                <ul>
                  <For each={group.scenarios}>
                    {(scenario) => (
                      <li>
                        <button
                          type="button"
                          aria-current={scenario.id === props.currentId() ? "page" : undefined}
                          onClick={() => props.open(scenario.path)}
                        >
                          <Icon path={demoScenarioIconPathGet(scenario.id)} />
                          <span>{scenario.label}</span>
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
