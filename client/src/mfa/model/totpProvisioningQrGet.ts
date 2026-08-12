import qrcode from "qrcode-generator"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export type TotpProvisioningQr = {
  moduleCount: number
  quietZone: number
  viewBoxSize: number
  path: string
}

const QUIET_ZONE = 2

export function totpProvisioningQrGet(provisioningUri: string): Result<TotpProvisioningQr> {
  const op = "totpProvisioningQrGet"
  if (!provisioningUri.startsWith("otpauth://totp/")) {
    return resultErrorCreate(op, "The setup code could not be displayed.")
  }

  try {
    const code = qrcode(0, "M")
    code.addData(provisioningUri, "Byte")
    code.make()
    const moduleCount = code.getModuleCount()
    let path = ""
    for (let row = 0; row < moduleCount; row += 1) {
      for (let column = 0; column < moduleCount; column += 1) {
        if (!code.isDark(row, column)) continue
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
      }
    }
    return resultCreate({
      moduleCount,
      quietZone: QUIET_ZONE,
      viewBoxSize: moduleCount + QUIET_ZONE * 2,
      path,
    })
  } catch (error) {
    return resultErrorCreate(op, "The setup code could not be displayed.", error)
  }
}
