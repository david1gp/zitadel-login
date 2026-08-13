import { describe, expect, test } from "bun:test"

import { pageBackgroundScreenFromAppGet } from "../client/src/app/model/pageBackgroundScreenFromAppGet"

describe("pageBackgroundScreenFromAppGet", () => {
  test("maps app statuses and methods to distinct screens", () => {
    expect(
      pageBackgroundScreenFromAppGet({
        status: "loading",
        recoveryRoute: undefined,
        passwordChangeRequired: false,
        selection: undefined,
      }),
    ).toBe("loading")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "fatal",
        recoveryRoute: undefined,
        passwordChangeRequired: false,
        selection: undefined,
      }),
    ).toBe("fatal")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "password_recovery",
        recoveryRoute: "request",
        passwordChangeRequired: false,
        selection: undefined,
      }),
    ).toBe("password_recovery")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "password_recovery",
        recoveryRoute: "reset",
        passwordChangeRequired: false,
        selection: undefined,
      }),
    ).toBe("password_reset")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "ready",
        recoveryRoute: undefined,
        passwordChangeRequired: true,
        selection: { method: "password" },
      }),
    ).toBe("password_change")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "ready",
        recoveryRoute: undefined,
        passwordChangeRequired: false,
        selection: undefined,
      }),
    ).toBe("chooser")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "ready",
        recoveryRoute: undefined,
        passwordChangeRequired: false,
        selection: { method: "email_otp" },
      }),
    ).toBe("email_otp")
    expect(
      pageBackgroundScreenFromAppGet({
        status: "ready",
        recoveryRoute: undefined,
        passwordChangeRequired: false,
        selection: { method: "mfa", factor: "totp" },
      }),
    ).toBe("mfa")
  })
})
