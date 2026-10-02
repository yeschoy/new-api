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
import { t } from '@/i18n/i18n'

import type { Plan, UserSubscription } from './subscription-api'

const DAY = 86_400
const HOUR = 3_600

/** Seconds as whole days, hours, minutes or seconds, whichever fits first. */
function spanLabel(seconds: number): string {
  if (seconds >= DAY) return t('{count} 天', { count: Math.floor(seconds / DAY) })
  if (seconds >= HOUR) return t('{count} 小时', { count: Math.floor(seconds / HOUR) })
  if (seconds >= 60) return t('{count} 分钟', { count: Math.floor(seconds / 60) })
  return t('{count} 秒', { count: seconds })
}

/** How long one purchase lasts, e.g. "1 个月". Call during render so it follows the language. */
export function durationLabel(plan: Plan): string {
  const count = plan.duration_value || 1
  switch (plan.duration_unit) {
    case 'year':
      return t('{count} 年', { count })
    case 'day':
      return t('{count} 天', { count })
    case 'hour':
      return t('{count} 小时', { count })
    case 'custom':
      return spanLabel(plan.custom_seconds ?? 0)
    default:
      return t('{count} 个月', { count })
  }
}

/** How often the plan's quota refills; null when it never does. */
export function resetLabel(plan: Plan): string | null {
  switch (plan.quota_reset_period) {
    case 'daily':
      return t('每天')
    case 'weekly':
      return t('每周')
    case 'monthly':
      return t('每月')
    case 'custom':
      return t('每 {span}', { span: spanLabel(plan.quota_reset_custom_seconds ?? 0) })
    default:
      return null
  }
}

export type SubscriptionState = 'active' | 'cancelled' | 'expired'

/** Active only while marked active and not yet past its end. */
export function subscriptionState(sub: UserSubscription, now: number): SubscriptionState {
  if (sub.status === 'active' && sub.end_time > now) return 'active'
  if (sub.status === 'cancelled') return 'cancelled'
  return 'expired'
}

export function daysLeft(sub: UserSubscription, now: number): number {
  return Math.max(0, Math.ceil((sub.end_time - now) / DAY))
}

/** Share of the quota used, 0–100; 0 for unlimited plans. */
export function usagePercent(sub: UserSubscription): number {
  if (sub.amount_total <= 0) return 0
  return Math.min(100, Math.round((sub.amount_used / sub.amount_total) * 100))
}
