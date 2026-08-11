import * as v from "valibot"

export const themePreferenceSchema = v.strictObject({
  value: v.picklist(["light", "dark", "system"]),
  updatedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type ThemePreference = v.InferOutput<typeof themePreferenceSchema>
