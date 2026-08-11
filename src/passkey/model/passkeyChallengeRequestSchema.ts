import * as v from "valibot"

const identifierSchema = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(200),
    v.check(
      (value) =>
        !Array.from(value).some((character) => {
          const code = character.codePointAt(0) ?? 0
          return code < 32 || code === 127
        }),
      "Invalid identifier",
    ),
  ),
)

export const passkeyChallengeRequestSchema = v.strictObject({
  identifier: identifierSchema,
  rpId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(253))),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type PasskeyChallengeRequest = v.InferOutput<typeof passkeyChallengeRequestSchema>
