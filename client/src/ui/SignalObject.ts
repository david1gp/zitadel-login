import type { Accessor } from "solid-js"

export type SignalObject<T> = { get: Accessor<T>; set: (value: T) => void }
