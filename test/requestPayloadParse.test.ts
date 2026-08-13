import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { requestPayloadParse } from "../src/http/requestPayloadParse"

const schema = v.strictObject({ value: v.string() })

function requestCreate(body: string, contentType: string, contentLength = body.length, onText?: () => void) {
  return {
    header: (name: string) =>
      name === "content-type" ? contentType : name === "content-length" ? String(contentLength) : undefined,
    text: async () => {
      onText?.()
      return body
    },
  }
}

describe("request payload parsing", () => {
  test("preserves exact and prefix media-type contracts", async () => {
    const prefix = await requestPayloadParse(requestCreate('{"value":"ok"}', "Application/JSON; charset=utf-8"), schema)
    expect(prefix).toEqual({ success: true, data: { value: "ok" } })

    const exact = await requestPayloadParse(
      requestCreate('{"value":"ok"}', "Application/JSON; charset=utf-8"),
      schema,
      { contentType: "exact", operation: "exactPayloadParse" },
    )
    expect(exact).toEqual({ success: false, op: "exactPayloadParse", errorMessage: "unsupported_media_type" })
  })

  test("checks the declared and actual limits before schema parsing", async () => {
    let readCount = 0
    const declaredTooLarge = await requestPayloadParse(
      requestCreate("{}", "application/json", 9, () => {
        readCount += 1
      }),
      schema,
      { maximumLength: 8 },
    )
    expect(declaredTooLarge).toEqual({ success: false, op: "payloadParse", errorMessage: "invalid_payload" })
    expect(readCount).toBe(0)

    const actualTooLarge = await requestPayloadParse(requestCreate('{"value":"12345"}', "application/json"), schema, {
      maximumLength: 8,
    })
    expect(actualTooLarge).toEqual({ success: false, op: "payloadParse", errorMessage: "invalid_payload" })
  })

  test("returns the shared invalid payload vocabulary for malformed JSON and schemas", async () => {
    const malformed = await requestPayloadParse(requestCreate("{", "application/json"), schema)
    const invalid = await requestPayloadParse(requestCreate("{}", "application/json"), schema)

    expect(malformed).toEqual({ success: false, op: "payloadParse", errorMessage: "invalid_payload" })
    expect(invalid).toEqual({ success: false, op: "payloadParse", errorMessage: "invalid_payload" })
  })
})
