import type { DemoScenario } from "./demoScenarioSchema"

export function demoScenariosFilter(scenarios: DemoScenario[], query: string): DemoScenario[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return scenarios
  return scenarios.filter((scenario) => {
    return (
      scenario.label.toLowerCase().includes(normalized) ||
      scenario.group.toLowerCase().includes(normalized) ||
      scenario.detail.toLowerCase().includes(normalized)
    )
  })
}
