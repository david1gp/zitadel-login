import { DurableObject } from "cloudflare:workers"

import { emailOtpCooldownObjectAlarm } from "./emailOtpCooldownObjectAlarm"
import { emailOtpCooldownObjectReserve } from "./emailOtpCooldownObjectReserve"
import type { EmailOtpCooldownObjectStorage } from "./emailOtpCooldownObjectStorage"
import { emailOtpCooldownObjectStatus } from "./emailOtpCooldownObjectStatus"
import type { EmailOtpCooldownReserveResult } from "./emailOtpCooldownReserveResultSchema"
import { emailOtpCooldownSqlSchemaEnsure } from "./emailOtpCooldownSqlSchemaEnsure"
import type { EmailOtpCooldownStatus } from "./emailOtpCooldownStatusSchema"

export class EmailOtpCooldownObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    emailOtpCooldownSqlSchemaEnsure(this.ctx.storage.sql)
  }

  async reserve(now: number): Promise<EmailOtpCooldownReserveResult> {
    return emailOtpCooldownObjectReserve(this.storage(), now)
  }

  async status(now: number): Promise<EmailOtpCooldownStatus> {
    return emailOtpCooldownObjectStatus(this.storage(), now)
  }

  async alarm(): Promise<void> {
    emailOtpCooldownObjectAlarm(this.storage(), Math.floor(Date.now() / 1000))
  }

  private storage(): EmailOtpCooldownObjectStorage {
    return {
      sql: this.ctx.storage.sql,
      transactionSync: (closure) => this.ctx.storage.transactionSync(closure),
      setAlarm: (scheduledTime) => this.ctx.storage.setAlarm(scheduledTime),
    }
  }
}
