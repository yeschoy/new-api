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
import type { CashbackTier } from '@/features/cashback/types'

export type TierInput = { threshold: string; reward: string }

/** Parse a CNY input without a floating-point intermediate. */
export function parseCnyCents(input: string): number | null {
  if (input.length > 20 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input)) {
    return null
  }
  const [yuan, fraction = ''] = input.split('.')
  const cents = BigInt(yuan) * 100n + BigInt(fraction.padEnd(2, '0'))
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(cents)
    : null
}

export function tierInputToCents(input: TierInput): CashbackTier {
  const threshold = parseCnyCents(input.threshold)
  const reward = parseCnyCents(input.reward)
  if (threshold == null || reward == null) {
    throw new Error('Invalid cashback tier amount')
  }
  return { threshold_cents: threshold, reward_cents: reward }
}

export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function nominalTierPercent(tiers: TierInput[]): number {
  return Math.max(
    0,
    ...tiers.map((tier) => {
      const threshold = parseCnyCents(tier.threshold)
      const reward = parseCnyCents(tier.reward)
      return threshold && reward ? (reward / threshold) * 100 : 0
    })
  )
}
