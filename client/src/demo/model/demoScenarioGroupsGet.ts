import type { DemoScenario } from "./demoScenarioSchema"

export function demoScenarioGroupsGet(scenarios: DemoScenario[]): Array<{ group: string; scenarios: DemoScenario[] }> {
  const groups: Array<{ group: string; scenarios: DemoScenario[] }> = []
  for (const scenario of scenarios) {
    const existing = groups.find((entry) => entry.group === scenario.group)
    if (existing) {
      existing.scenarios.push(scenario)
      continue
    }
    groups.push({ group: scenario.group, scenarios: [scenario] })
  }
  return groups
}
