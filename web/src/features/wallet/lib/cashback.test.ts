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
import { describe, expect, it } from 'vitest'

import {
  estimateTopupCashbackQuota,
  getPayerCashbackRule,
  type PayerCashbackRule,
} from './cashback'

const perHundred: PayerCashbackRule = {
  strategy: 'per_hundred',
  rateBps: 0,
  fixedPerHundred: 3,
}

describe('estimateTopupCashbackQuota', () => {
  it('selects only the highest reached cent threshold without stacking or extrapolating', () => {
    const tiered: PayerCashbackRule = {
      strategy: 'tiered',
      rateBps: 0,
      fixedPerHundred: 0,
      tiers: [
        { threshold_cents: 10050, reward_cents: 250 },
        { threshold_cents: 20000, reward_cents: 1500 },
      ],
    }
    expect(estimateTopupCashbackQuota(100, tiered, 500000, false)).toBe(0)
    expect(estimateTopupCashbackQuota(101, tiered, 500000, false)).toBe(1250000)
    expect(estimateTopupCashbackQuota(250, tiered, 500000, false)).toBe(7500000)
    expect(estimateTopupCashbackQuota(1200, tiered, 500000, false)).toBe(
      7500000
    )
    expect(estimateTopupCashbackQuota(250, tiered, 500000, true)).toBe(0)
    expect(estimateTopupCashbackQuota(250, tiered, 1, false)).toBe(0)
  })

  it('floors a reached cent reward once with a positive fractional checkout factor', () => {
    const tiered: PayerCashbackRule = {
      strategy: 'tiered',
      rateBps: 0,
      fixedPerHundred: 0,
      tiers: [{ threshold_cents: 10050, reward_cents: 101 }],
    }
    // 1.01 CNY × 500000.25 quota/CNY = 505000.2525 → 505000.
    expect(estimateTopupCashbackQuota(101, tiered, 500000.25, false)).toBe(
      505000
    )
    expect(estimateTopupCashbackQuota(100, tiered, 500000.25, false)).toBe(0)
  })

  it('counts only complete hundreds of the top-up amount', () => {
    expect(estimateTopupCashbackQuota(10, perHundred, 500_000, false)).toBe(0)
    expect(estimateTopupCashbackQuota(99, perHundred, 500_000, false)).toBe(0)
    expect(estimateTopupCashbackQuota(100, perHundred, 500_000, false)).toBe(
      1_500_000
    )
    expect(estimateTopupCashbackQuota(250, perHundred, 500_000, false)).toBe(
      3_000_000
    )
  })

  it('uses one quota per token in token display', () => {
    expect(estimateTopupCashbackQuota(250, perHundred, 100, true)).toBe(6)
  })

  it('applies the rate to the credited base quota', () => {
    const rate: PayerCashbackRule = {
      strategy: 'rate',
      rateBps: 500,
      fixedPerHundred: 0,
    }
    expect(estimateTopupCashbackQuota(200, rate, 500_000, false)).toBe(
      5_000_000
    )
  })
})

describe('getPayerCashbackRule', () => {
  it('reads tiered preview with its config version but excludes non-applicable methods', () => {
    const tiers = [{ threshold_cents: 10050, reward_cents: 250 }]
    expect(
      getPayerCashbackRule({
        status: 'estimated',
        strategy: 'tiered',
        tiers,
        config_version: 7,
        reward_quota: 1250000,
        as_of: 1,
      })
    ).toMatchObject({
      strategy: 'tiered',
      tiers,
      configVersion: 7,
    })
    expect(
      getPayerCashbackRule({
        status: 'rounds_to_zero',
        strategy: 'tiered',
        tiers,
        matched_tier: tiers[0],
        reward_quota: 0,
        as_of: 1,
      })
    ).toMatchObject({ strategy: 'tiered', tiers })
    expect(
      getPayerCashbackRule({
        status: 'not_applicable',
        strategy: 'tiered',
        reward_quota: 0,
        as_of: 1,
      })
    ).toBeNull()
  })

  it('only exposes a rule for payers who can receive cashback', () => {
    expect(
      getPayerCashbackRule({
        status: 'estimated',
        strategy: 'per_hundred',
        fixed_per_hundred: 3,
        reward_quota: 1,
        as_of: 1,
      })
    ).toEqual(perHundred)
    expect(
      getPayerCashbackRule({
        status: 'ineligible',
        strategy: 'per_hundred',
        fixed_per_hundred: 3,
        reward_quota: 0,
        as_of: 1,
      })
    ).toBeNull()
    expect(
      getPayerCashbackRule({
        status: 'select_amount',
        reward_quota: 0,
        as_of: 1,
      })
    ).toBeUndefined()
  })
})
