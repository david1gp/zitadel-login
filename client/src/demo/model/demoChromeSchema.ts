import * as v from "valibot"

export const demoChromeSchema = v.picklist(["sidebar", "compact"])

export type DemoChrome = v.InferOutput<typeof demoChromeSchema>
