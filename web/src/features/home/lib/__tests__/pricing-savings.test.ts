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

import type { PricingModel } from '@/features/pricing/types'

import {
  buildSavingsCatalog,
  buildSavingsModels,
  calculateSavingsEstimate,
  formatCnyAmount,
  formatTokenMillions,
  tokenMillionsToSliderPosition,
  tokenSliderPositionToMillions,
  type SavingsModel,
} from '../pricing-savings'

function makePricingModel(
  modelName: string,
  modelRatio: number,
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: modelName.length,
    model_name: modelName,
    quota_type: 0,
    model_ratio: modelRatio,
    completion_ratio: 2,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

function makeSavingsModel(
  modelName: string,
  family: SavingsModel['family'],
  prices: {
    officialInput: number
    officialOutput: number
    officialCacheRead?: number | null
    officialCacheWrite?: number | null
    siteInput: number
    siteOutput: number
    siteCacheRead?: number | null
    siteCacheWrite?: number | null
  }
): SavingsModel {
  return {
    modelName,
    vendorName: modelName,
    family,
    baseInputPrice: prices.officialInput,
    baseOutputPrice: prices.officialOutput,
    baseCacheReadPrice: prices.officialCacheRead ?? null,
    baseCacheWritePrice: prices.officialCacheWrite ?? null,
    siteInputPrice: prices.siteInput,
    siteOutputPrice: prices.siteOutput,
    siteCacheReadPrice: prices.siteCacheRead ?? null,
    siteCacheWritePrice: prices.siteCacheWrite ?? null,
    savingsPercent: 50,
  }
}

describe('buildSavingsModels', () => {
  it('selects the newest available model in each family instead of the most expensive one', () => {
    const models = buildSavingsModels(
      [
        makePricingModel('gpt-5.2', 8),
        makePricingModel('gpt-5.6', 4),
        makePricingModel('deepseek-v3.2', 3),
        makePricingModel('deepseek-v4', 2),
      ],
      4
    )

    expect(models.slice(0, 2).map((model) => model.modelName)).toEqual([
      'gpt-5.6',
      'deepseek-v4',
    ])
    expect(models).toHaveLength(2)
  })

  it('uses live group and recharge ratios while excluding request pricing', () => {
    const models = buildSavingsModels(
      [
        makePricingModel('gpt-5', 4, {
          completion_ratio: 3,
          enable_groups: ['standard', 'value'],
          group_ratio: { standard: 1, value: 0.5 },
        }),
        makePricingModel('image-request-model', 100, { quota_type: 1 }),
      ],
      4
    )

    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      baseInputPrice: 32,
      baseOutputPrice: 96,
      siteInputPrice: 16,
      savingsPercent: 50,
    })
    expect(models[0].siteOutputPrice).toBeCloseTo(48)
  })

  it('derives live cache read and write prices from the pricing ratios', () => {
    const [model] = buildSavingsCatalog(
      [
        makePricingModel('cached-model', 1, {
          completion_ratio: 4,
          cache_ratio: 0.1,
          create_cache_ratio: 1.25,
          group_ratio: { default: 0.5 },
        }),
      ],
      4
    )

    expect(model).toMatchObject({
      baseInputPrice: 8,
      baseOutputPrice: 32,
      baseCacheWritePrice: 10,
      siteInputPrice: 4,
      siteOutputPrice: 16,
      siteCacheReadPrice: 0.4,
      siteCacheWritePrice: 5,
    })
    expect(model.baseCacheReadPrice).toBeCloseTo(0.8)
  })

  it('returns no comparison rows when pricing has no valid token model', () => {
    expect(
      buildSavingsModels(
        [makePricingModel('request-only', 1, { quota_type: 1 })],
        1
      )
    ).toEqual([])
  })

  it('keeps the complete live token catalog available to the calculator', () => {
    const sourceModels = Array.from({ length: 8 }, (_, index) =>
      makePricingModel(`custom-model-${index + 1}`, index + 1)
    )

    expect(buildSavingsModels(sourceModels, 4)).toHaveLength(1)
    expect(buildSavingsCatalog(sourceModels, 4)).toHaveLength(8)
  })

  it('uses a single deterministic billing expression as the pricing source', () => {
    const models = buildSavingsCatalog(
      [
        makePricingModel('dynamic-model', 0, {
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 10 + c * 20 + cr * 2)',
          group_ratio: { default: 0.5 },
        }),
      ],
      4
    )

    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      baseInputPrice: 40,
      baseOutputPrice: 80,
      baseCacheReadPrice: 8,
      siteInputPrice: 20,
      siteOutputPrice: 40,
      siteCacheReadPrice: 4,
    })
  })

  it.each([
    'tier("base", p * 10 + c * 20) * 2',
    'len <= 1000 ? tier("base", p * 10 + c * 20) : 0',
    'tier("base", p * 10 + c * 20 + 100)',
    'tier("base", p * 10 + c * 20 + cr * 2 / 2)',
    'tier("base", p * 10 + c * 20 + cc1h * 5)',
    'tier("base", p * 1e309 + c * 20)',
  ])(
    'excludes formulas outside the supported complete token mix: %s',
    (billingExpr) => {
      expect(
        buildSavingsCatalog(
          [
            makePricingModel('dynamic', 1, {
              billing_mode: 'tiered_expr',
              billing_expr: billingExpr,
            }),
          ],
          1
        )
      ).toEqual([])
    }
  )

  it('preserves explicit free cache terms instead of charging regular input', () => {
    const models = buildSavingsCatalog(
      [
        makePricingModel('dynamic', 1, {
          billing_mode: 'tiered_expr',
          billing_expr: 'v1:tier("base", p * 10 + c * 20 + cr * 0 + cc * 0)',
          group_ratio: { default: 0.5 },
        }),
      ],
      1
    )
    expect(models[0]).toMatchObject({
      siteCacheReadPrice: 0,
      siteCacheWritePrice: 0,
    })
    const estimate = calculateSavingsEstimate(models, 'coding', 1, 1, {
      inputPercent: 0,
      cacheReadPercent: 50,
      cacheWritePercent: 50,
      outputPercent: 0,
    })
    expect(estimate.siteMonthlyCost).toBe(0)
    expect(estimate.baseMonthlyCost).toBe(0)
  })

  it('keeps omitted cache terms billable as input even when the label mentions cache', () => {
    const models = buildSavingsCatalog(
      [
        makePricingModel('dynamic', 1, {
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("cr * 0", p * 10 + c * 20)',
        }),
      ],
      1
    )
    expect(models[0].siteCacheReadPrice).toBeNull()
    expect(
      calculateSavingsEstimate(models, 'coding', 1, 1, {
        inputPercent: 0,
        cacheReadPercent: 100,
        cacheWritePercent: 0,
        outputPercent: 0,
      }).siteMonthlyCost
    ).toBe(10)
  })

  it('sums repeated terms and accepts reordered prices with scientific notation', () => {
    const [model] = buildSavingsCatalog(
      [
        makePricingModel('dynamic', 1, {
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", cr * 1e-1 + c * 2e+1 + p * 3 + p * 7)',
        }),
      ],
      1
    )
    expect(model).toMatchObject({
      siteInputPrice: 10,
      siteOutputPrice: 20,
      siteCacheReadPrice: 0.1,
    })
  })

  it('excludes conditional expression pricing that the calculator cannot model', () => {
    const models = buildSavingsCatalog(
      [
        makePricingModel('tiered-model', 1, {
          billing_mode: 'tiered_expr',
          billing_expr:
            'len <= 1000 ? tier("short", p * 1 + c * 2) : tier("long", p * 3 + c * 6)',
        }),
      ],
      4
    )

    expect(models).toEqual([])
  })

  it('excludes non-canonical expressions instead of using stale ratios', () => {
    const models = buildSavingsCatalog(
      [
        makePricingModel('special-model', 1, {
          billing_mode: 'tiered_expr',
          billing_expr: 'p * 10 + c * 20',
        }),
      ],
      4
    )

    expect(models).toEqual([])
  })
})

describe('localized display values', () => {
  it('formats all savings as Chinese yuan', () => {
    expect(formatCnyAmount(110_000, { compact: true })).toBe('¥11万')
    expect(formatCnyAmount(6_100)).toBe('¥6,100')
  })

  it('spells out Chinese token quantities for non-technical readers', () => {
    expect(formatTokenMillions(1, 'zh-CN')).toBe('100万')
    expect(formatTokenMillions(200, 'zh-CN')).toBe('2亿')
    expect(formatTokenMillions(20, 'zhCN')).toBe('2000万')
  })
})

describe('calculateSavingsEstimate', () => {
  it('uses the visible coding token mix and bills unsupported cache as normal input', () => {
    const estimate = calculateSavingsEstimate(
      [
        makeSavingsModel('claude-flagship', 'anthropic', {
          officialInput: 2,
          officialOutput: 6,
          siteInput: 1,
          siteOutput: 3,
        }),
        makeSavingsModel('gpt-flagship', 'openai', {
          officialInput: 4,
          officialOutput: 8,
          siteInput: 2,
          siteOutput: 4,
        }),
      ],
      'coding',
      20,
      2
    )

    expect(estimate.representativeModels).toHaveLength(2)
    expect(estimate.tokenMix).toEqual({
      inputPercent: 15,
      cacheReadPercent: 55,
      cacheWritePercent: 10,
      outputPercent: 20,
    })
    expect(estimate.baseMonthlyCost).toBe(152)
    expect(estimate.siteMonthlyCost).toBe(76)
    expect(estimate.monthlySavings).toBe(76)
    expect(estimate.annualSavings).toBe(912)
  })

  it('prices cache reads and writes independently for cache-heavy coding', () => {
    const estimate = calculateSavingsEstimate(
      [
        makeSavingsModel('cached-coding-model', 'anthropic', {
          officialInput: 14,
          officialOutput: 56,
          officialCacheRead: 1.4,
          officialCacheWrite: 17.5,
          siteInput: 4,
          siteOutput: 16,
          siteCacheRead: 0.4,
          siteCacheWrite: 5,
        }),
      ],
      'coding',
      10,
      1
    )

    expect(estimate.baseMonthlyCost).toBeCloseTo(158.2)
    expect(estimate.siteMonthlyCost).toBeCloseTo(45.2)
    expect(estimate.monthlySavings).toBeCloseTo(113)
  })

  it('never presents a negative saving when the site price is higher', () => {
    const estimate = calculateSavingsEstimate(
      [
        makeSavingsModel('support-model', 'deepseek', {
          officialInput: 1,
          officialOutput: 1,
          siteInput: 2,
          siteOutput: 2,
        }),
      ],
      'support',
      10,
      1
    )

    expect(estimate.monthlySavings).toBe(0)
    expect(estimate.annualSavings).toBe(0)
  })
})

describe('token slider scale', () => {
  it('maps the logarithmic range to the documented token boundaries', () => {
    expect(tokenSliderPositionToMillions(0)).toBe(1)
    expect(tokenSliderPositionToMillions(100)).toBe(200)
    expect(
      tokenSliderPositionToMillions(tokenMillionsToSliderPosition(20))
    ).toBeCloseTo(20, 0)
  })
})
