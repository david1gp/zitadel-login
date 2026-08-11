import * as v from "valibot"

const identifierSchema = v.pipe(
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
)

const passwordSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))

export const passwordVerifyRequestSchema = v.strictObject({
  identifier: identifierSchema,
  password: passwordSchema,
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type PasswordVerifyRequest = v.InferOutput<typeof passwordVerifyRequestSchema>
