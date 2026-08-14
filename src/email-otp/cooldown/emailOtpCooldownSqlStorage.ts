export type EmailOtpCooldownSqlStorage = {
  exec: (
    query: string,
    ...bindings: Array<ArrayBuffer | string | number | null>
  ) => {
    toArray: () => Array<Record<string, ArrayBuffer | string | number | null>>
  }
}
