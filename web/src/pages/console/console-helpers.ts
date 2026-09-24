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
import { formatAmount, type CurrencyDisplay } from '@/lib/pricing'
import type { UsageLog } from '@/lib/services'

/** Backend default for `quota_per_unit` (quota units per 1 USD). */
export const DEFAULT_QUOTA_PER_UNIT = 500_000

function perUnit(quotaPerUnit?: number): number {
  return quotaPerUnit && quotaPerUnit > 0 ? quotaPerUnit : DEFAULT_QUOTA_PER_UNIT
}

/** Backend quota units → USD. */
export function quotaToUsd(quota: number | undefined, quotaPerUnit?: number): number {
  return (quota ?? 0) / perUnit(quotaPerUnit)
}

/** Quota units → display string in the operator's currency. */
export function formatQuota(quota: number | undefined, currency: CurrencyDisplay, quotaPerUnit?: number): string {
  return formatAmount(quotaToUsd(quota, quotaPerUnit), currency)
}

/** An amount typed in the display currency → whole backend quota units. */
export function amountToQuota(amount: number, currency: CurrencyDisplay, quotaPerUnit?: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round((amount / (currency.rate || 1)) * perUnit(quotaPerUnit))
}

/** Keys are stored without the `sk-` prefix clients send. */
export function withKeyPrefix(key: string): string {
  if (!key) return ''
  return key.startsWith('sk-') ? key : `sk-${key}`
}

const KEY_STATUS_LABELS: Record<number, string> = { 2: '已禁用', 3: '已过期', 4: '已耗尽' }

/** Badge text for a non-enabled key, or null when the key is usable. */
export function keyStatusLabel(status: number): string | null {
  return KEY_STATUS_LABELS[status] ?? null
}

export function roleLabel(role: number | undefined): string {
  if (role === undefined) return '—'
  if (role >= 100) return '超级管理员'
  if (role >= 10) return '管理员'
  if (role >= 1) return '普通用户'
  return '访客'
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil((total || 0) / size))
}

export type UsageTotals = { quota: number; tokens: number; requests: number }

export function sumLogs(logs: UsageLog[]): UsageTotals {
  return logs.reduce<UsageTotals>(
    (acc, log) => ({
      quota: acc.quota + (log.quota || 0),
      tokens: acc.tokens + (log.prompt_tokens || 0) + (log.completion_tokens || 0),
      requests: acc.requests + 1,
    }),
    { quota: 0, tokens: 0, requests: 0 }
  )
}

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The last `days` local calendar days ending today: window bounds + day labels. */
export function recentWindow(now: Date, days: number): { start: number; end: number; dates: string[] } {
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  const dates = Array.from({ length: days }, (_, index) =>
    localDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + index))
  )
  return { start: Math.floor(first.getTime() / 1000), end: Math.floor(now.getTime() / 1000), dates }
}

/** use_time is whole seconds. */
export function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
