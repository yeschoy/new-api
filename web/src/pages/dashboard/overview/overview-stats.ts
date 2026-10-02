/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { t, tk } from '@/i18n/i18n'

import type { QuotaRow, TimeWindow } from '../dashboard-api'
import type { DotTone } from '../dashboard-ui'

/** Days the balance lasts at the last 24 hours' spend; null without a balance or recent spend. */
export function runwayDays(balance: number, daySpend: number): number | null {
  if (balance <= 0 || daySpend <= 0) return null
  const days = balance / daySpend
  return Number.isFinite(days) ? days : null
}

export type BalanceHealth = { label: string; tone: DotTone }

const HEALTH: Record<'healthy' | 'low' | 'empty', BalanceHealth> = {
  healthy: { label: tk('余额充足'), tone: 'good' },
  low: { label: tk('余额偏低'), tone: 'warn' },
  empty: { label: tk('余额已用完'), tone: 'bad' },
}

/** Used up at zero; low when it lasts under three days at the current pace. */
export function balanceHealth(balance: number, daySpend: number): BalanceHealth {
  if (balance <= 0) return HEALTH.empty
  const days = runwayDays(balance, daySpend)
  if (days !== null && days < 3) return HEALTH.low
  return HEALTH.healthy
}

/** How long the balance lasts, as a sentence. */
export function runwayLabel(balance: number, daySpend: number): string {
  if (balance <= 0) return t('余额已用完')
  const days = runwayDays(balance, daySpend)
  if (days === null) return t('近期没有用量')
  if (days < 1) return t('预计可用不足 1 天')
  if (days > 999) return t('预计可用 999+ 天')
  return t('预计可用约 {days} 天', { days: Math.floor(days) })
}

/** Spend and requests of a window split into equal slices, oldest first, for sparklines. */
export function sliceUsage(rows: QuotaRow[], window: TimeWindow, slices = 12): { quota: number[]; requests: number[] } {
  const quota = Array.from({ length: slices }, () => 0)
  const requests = Array.from({ length: slices }, () => 0)
  const span = Math.max(1, window.end - window.start)
  for (const row of rows) {
    const ratio = (Number(row.created_at) - window.start) / span
    const index = Math.min(slices - 1, Math.max(0, Math.floor(ratio * slices)))
    quota[index] += Number(row.quota) || 0
    requests[index] += Number(row.count) || 0
  }
  return { quota, requests }
}
