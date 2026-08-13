import { describe, expect, test } from "bun:test"

import { pageBackgroundScreenSchema } from "../client/src/ui/styles/pageBackgroundScreenSchema"
import { pageBackgroundStyleGet } from "../client/src/ui/styles/pageBackgroundStyleGet"

describe("pageBackgroundStyleGet", () => {
  test("gives every screen a background image and brand color", () => {
    for (const screen of pageBackgroundScreenSchema.options) {
      const style = pageBackgroundStyleGet(screen)
      expect(style["background-color"]).toBe("var(--brand-background)")
      expect(style["background-image"]?.length).toBeGreaterThan(10)
    }
  })

  test("uses a distinct pattern for each primary screen family", () => {
    const families = [
      "chooser",
      "email_otp",
      "password",
      "password_change",
      "passkey",
      "identity_provider",
      "mfa",
      "password_recovery",
    ] as const
    const images = new Set(families.map((screen) => pageBackgroundStyleGet(screen)["background-image"]))
    expect(images.size).toBe(families.length)
  })
})
