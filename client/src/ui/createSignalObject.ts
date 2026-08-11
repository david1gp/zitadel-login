import { createSignal } from "solid-js"

import type { SignalObject } from "./SignalObject"

export function createSignalObject<T>(initialValue: T): SignalObject<T> {
  const [get, set] = createSignal(initialValue)
  return { get, set }
}
