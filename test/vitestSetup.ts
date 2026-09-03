function memoryStorageCreate(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

const localStorage = memoryStorageCreate()
const sessionStorage = memoryStorageCreate()

Object.defineProperty(window, "localStorage", { configurable: true, value: localStorage })
Object.defineProperty(window, "sessionStorage", { configurable: true, value: sessionStorage })
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage })
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: sessionStorage })
