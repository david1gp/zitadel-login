import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"

export const demoRecentAccounts: RecentAccountSummary[] = [
  {
    id: "ada",
    label: "Ada Lovelace",
    lastUsedAt: 1_700_000_000_000,
    reauthenticationRequired: false,
  },
  {
    id: "grace",
    label: "grace@example.com",
    lastUsedAt: 1_699_000_000_000,
    reauthenticationRequired: true,
  },
]
