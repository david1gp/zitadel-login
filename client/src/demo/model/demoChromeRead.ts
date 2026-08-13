import * as v from "valibot"

import { type DemoChrome, demoChromeSchema } from "./demoChromeSchema"

export function demoChromeRead(search: string): DemoChrome {
  const parsed = v.safeParse(demoChromeSchema, new URLSearchParams(search).get("chrome"))
  return parsed.success ? parsed.output : "sidebar"
}
