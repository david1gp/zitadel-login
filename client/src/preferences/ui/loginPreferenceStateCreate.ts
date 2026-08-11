import { onCleanup } from "solid-js"

import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { createSignalObject } from "../../ui/createSignalObject"
import { loginIdentifierNormalize } from "../model/loginIdentifierNormalize"
import { loginPreferenceLoad } from "../model/loginPreferenceLoad"
import { loginPreferenceSave } from "../model/loginPreferenceSave"

export function loginPreferenceStateCreate(storage: Storage | undefined) {
  const rememberIdentifier = createSignalObject(false)
  let organizationId = "default"
  let preferenceTimer: number | undefined
  let idleCallbackId: number | undefined

  const preferenceCancelScheduled = () => {
    if (preferenceTimer !== undefined) {
      window.clearTimeout(preferenceTimer)
      preferenceTimer = undefined
    }
    if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleCallbackId)
      idleCallbackId = undefined
    }
  }

  const preferenceSave = (selection: LoginMethodSelection, identifier: string) => {
    preferenceCancelScheduled()
    if (!storage) return
    const normalized = loginIdentifierNormalize(identifier)
    const common = {
      version: 1,
      rememberIdentifier: rememberIdentifier.get(),
      ...(rememberIdentifier.get() && normalized ? { identifier: normalized } : {}),
      updatedAt: Date.now(),
    } as const
    if (selection.method === "mfa") return
    if (selection.method === "identity_provider") {
      loginPreferenceSave(storage, organizationId, {
        ...common,
        selectedMethod: selection.method,
        identityProviderId: selection.identityProviderId,
      })
      return
    }
    loginPreferenceSave(storage, organizationId, { ...common, selectedMethod: selection.method })
  }

  const preferenceSchedule = (selection: LoginMethodSelection, identifier: string) => {
    preferenceCancelScheduled()
    preferenceTimer = window.setTimeout(() => {
      preferenceTimer = undefined
      const save = () => {
        idleCallbackId = undefined
        preferenceSave(selection, identifier)
      }
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(save, { timeout: 500 })
        return
      }
      save()
    }, 180)
  }

  onCleanup(() => preferenceCancelScheduled())

  return {
    rememberIdentifier: rememberIdentifier.get,
    initialize: (nextOrganizationId: string) => {
      organizationId = nextOrganizationId
      if (!storage) return undefined
      const loaded = loginPreferenceLoad(storage, organizationId)
      if (!loaded.success || !loaded.data) return undefined
      rememberIdentifier.set(loaded.data.rememberIdentifier)
      return loaded.data
    },
    schedule: preferenceSchedule,
    save: preferenceSave,
    rememberIdentifierChange: (checked: boolean, selection: LoginMethodSelection | undefined, identifier: string) => {
      rememberIdentifier.set(checked)
      if (selection) preferenceSchedule(selection, identifier)
    },
  }
}
