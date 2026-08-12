import * as v from "valibot"

export const demoScenarioSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  path: v.pipe(v.string(), v.regex(/^\/demo(?:\/[a-z0-9-]+)*$/), v.maxLength(200)),
  group: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  detail: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

export type DemoScenario = v.InferOutput<typeof demoScenarioSchema>
