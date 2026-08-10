import { createSignal } from "solid-js"

export function signalObjectCreate<T>(initialValue: T) {
  const [get, set] = createSignal(initialValue)
  return { get, set }
}
