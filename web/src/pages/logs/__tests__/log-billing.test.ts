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
import { billingPathLabel, chargedQuota, costComparison, dynamicLineItems, parseTiers, tieredSummary } from '../log-billing'

const EXPR = 'v1:len <= 200000 ? tier("short", p * 2.5 + c * 15 + cr * 0.25) : tier("long", p * 5 + c * 22.5)'
const EXPR_B64 = btoa(EXPR)

describe('parseTiers', () => {
  it('reads each tier label and its per-million prices', () => {
    expect(parseTiers(EXPR)).toEqual([
      { label: 'short', prices: { p: 2.5, c: 15, cr: 0.25 } },
      { label: 'long', prices: { p: 5, c: 22.5 } },
    ])
  })

  it('returns no tiers for an empty expression', () => {
    expect(parseTiers('')).toEqual([])
  })
})

describe('tieredSummary', () => {
  it('lists the matched tier prices and leaves cache prices out when no cache was used', () => {
    const summary = tieredSummary({ billing_mode: 'tiered_expr', expr_b64: EXPR_B64, matched_tier: ' Short ' })
    expect(summary?.tier.label).toBe('short')
    expect(summary?.entries.map((entry) => [entry.key, entry.price])).toEqual([
      ['p', 2.5],
      ['c', 15],
    ])
  })

  it('keeps cache prices when the request read the cache', () => {
    const summary = tieredSummary({ billing_mode: 'tiered_expr', expr_b64: EXPR_B64, matched_tier: 'short', cache_tokens: 10 })
    expect(summary?.entries.map((entry) => entry.key)).toEqual(['p', 'c', 'cr'])
  })

  it('does not guess a tier when the recorded one is missing', () => {
    expect(tieredSummary({ billing_mode: 'tiered_expr', expr_b64: EXPR_B64, matched_tier: 'medium' })).toBeNull()
    expect(tieredSummary({ model_ratio: 1 })).toBeNull()
  })
})

describe('dynamicLineItems', () => {
  const other = {
    billing_mode: 'tiered_expr',
    expr_b64: EXPR_B64,
    matched_tier: 'long',
    billing_usage: { p: 1000, c: 500, len: 1500, cr: 0, cc: 0, cc1h: 0, img: 0, img_o: 0, ai: 0, ao: 0 },
    request_rules: [{ cond: 'header.x == 1', multiplier: 2, matched: true }],
    billing_cost_before_group: 0.0325,
  }

  it('rebuilds the charge from usage, tier prices and matched request rules', () => {
    const details = dynamicLineItems(other)
    expect(details?.multiplier).toBe(2)
    expect(details?.items.map((item) => [item.key, item.quantity, item.unitPrice, item.cost])).toEqual([
      ['p', 1000, 5, 0.01],
      ['c', 500, 22.5, 0.0225],
    ])
  })

  it('gives up when the rebuilt charge does not match the recorded one', () => {
    expect(dynamicLineItems({ ...other, billing_cost_before_group: 0.5 })).toBeNull()
  })
})

describe('chargedQuota', () => {
  it('uses the violation fee when one was charged', () => {
    expect(chargedQuota(800, { fee_quota: 300 })).toBe(300)
    expect(chargedQuota(800, null)).toBe(800)
  })
})

describe('costComparison', () => {
  const rates = { priceRate: 1, quotaPerUnit: 500_000 }

  it('compares the charge with the recorded base price of a USD-priced model', () => {
    expect(costComparison(500_000, { group_ratio: 0.5, model_ratio: 1 }, 'gpt-4o', rates)).toEqual({
      baseCost: 13.5,
      siteCost: 1,
      savings: 12.5,
      currency: 'USD',
    })
  })

  it('shows nothing when the site is not cheaper', () => {
    expect(costComparison(500_000, { group_ratio: 0.5 }, 'deepseek-chat', { priceRate: 7.3, quotaPerUnit: 500_000 })).toBeNull()
  })

  it('skips subscription, per-call and violation charges', () => {
    expect(costComparison(500_000, { group_ratio: 0.5, billing_source: 'subscription' }, 'gpt-4o', rates)).toBeNull()
    expect(costComparison(500_000, { group_ratio: 0.5, model_price: 0.02 }, 'gpt-4o', rates)).toBeNull()
    expect(costComparison(500_000, { group_ratio: 0.5, violation_fee: true }, 'gpt-4o', rates)).toBeNull()
  })
})

describe('billingPathLabel', () => {
  it('names where the usage numbers came from', () => {
    expect(billingPathLabel({ usage_billing_path: 'local' })).toBe('本地计费')
    expect(billingPathLabel({ usage_billing_path: 'billing-usage-openai' })).toBe('上游返回（billing-usage-openai）')
    expect(billingPathLabel({ local_count_tokens: true })).toBe('本地计费')
    expect(billingPathLabel({})).toBe('上游返回')
  })
})
