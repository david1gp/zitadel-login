import type { DemoScenario } from "./demoScenarioSchema"
import { demoScenarios } from "./demoScenarios"

export function demoScenarioRead(pathname: string): DemoScenario {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  return demoScenarios.find((scenario) => scenario.path === normalized) ?? demoScenarios[0]!
}
