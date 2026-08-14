export type Result<T, Metadata extends object = object> =
  | ({ success: true; data: T } & Metadata)
  | ({ success: false; op: string; errorMessage: string; rawData?: unknown; status?: number } & Metadata)
