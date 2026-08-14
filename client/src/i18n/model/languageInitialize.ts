import { browserStorageGet } from "../../preferences/model/browserStorageGet"
import { languageApply } from "./languageApply"
import { languageResolve } from "./languageResolve"

/** Resolves and applies the initial language during app startup. */
export async function languageInitialize(browserWindow: Window): Promise<void> {
  const storage = browserStorageGet(browserWindow)
  const tags = browserWindow.navigator.languages ?? [browserWindow.navigator.language]
  await languageApply(languageResolve(storage.success ? storage.data : undefined, tags))
}
