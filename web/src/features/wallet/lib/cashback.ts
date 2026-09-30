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
import type { PayerCashbackPreview } from '../types'

/**
 * Display-only payer cashback rule taken from the latest settled preview.
 * Checkout and settlement never consume it.
 */
export interface PayerCashbackRule {
  strategy: 'rate' | 'per_hundred'
  rateBps: number
  fixedPerHundred: number
}

/**
 * Preview statuses that prove an active campaign applies to the current payer.
 * Other statuses hide per-amount hints so they never promise an unavailable reward.
 */
export function getPayerCashbackRule(
  preview: PayerCashbackPreview | undefined
): PayerCashbackRule | null | undefined {
  if (!preview) return undefined
  switch (preview.status) {
    case 'estimated':
    case 'below_minimum':
      if (preview.strategy === 'per_hundred') {
        return (preview.fixed_per_hundred ?? 0) > 0
          ? {
              strategy: 'per_hundred',
              rateBps: 0,
              fixedPerHundred: preview.fixed_per_hundred ?? 0,
            }
          : null
      }
      return (preview.rate_bps ?? 0) > 0
        ? {
            strategy: 'rate',
            rateBps: preview.rate_bps ?? 0,
            fixedPerHundred: 0,
          }
        : null
    case 'select_amount':
      // No amount selected yet: keep whatever rule was known before.
      return undefined
    default:
      return null
  }
}

/**
 * Quota units credited per face unit of a standard top-up amount.
 * Mirrors the checkout snapshot: currency displays use `quotaPerUnit`,
 * token display uses 1 quota per token.
 */
export function getCashbackQuotaPerFaceUnit(
  quotaPerUnit: number,
  tokensDisplay: boolean
): number {
  return tokensDisplay ? 1 : quotaPerUnit
}

/**
 * Nominal payer cashback (in quota units) for a standard top-up amount,
 * mirroring the server calculation before single/24-hour caps.
 */
export function estimateTopupCashbackQuota(
  amount: number,
  rule: PayerCashbackRule,
  quotaPerUnit: number,
  tokensDisplay: boolean
): number {
  if (!Number.isFinite(amount) || amount <= 0 || quotaPerUnit <= 0) return 0
  const baseQuota = tokensDisplay
    ? Math.floor(amount / quotaPerUnit) * quotaPerUnit
    : Math.round(amount * quotaPerUnit)
  if (baseQuota <= 0) return 0
  if (rule.strategy === 'per_hundred') {
    const face = tokensDisplay ? baseQuota : amount
    const factor = getCashbackQuotaPerFaceUnit(quotaPerUnit, tokensDisplay)
    return Math.floor(Math.floor(face / 100) * rule.fixedPerHundred * factor)
  }
  return Math.floor((baseQuota * rule.rateBps) / 10000)
}
