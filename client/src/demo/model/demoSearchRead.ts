import * as v from "valibot"

const demoSearchSchema = v.pipe(v.string(), v.maxLength(80))

export function demoSearchRead(search: string): string {
  const parsed = v.safeParse(demoSearchSchema, new URLSearchParams(search).get("q") ?? "")
  return parsed.success ? parsed.output : ""
}
