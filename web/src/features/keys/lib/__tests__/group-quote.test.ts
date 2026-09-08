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

import type { SavingsModel } from '@/features/home/lib/pricing-savings'

import { describeGroupDiscount, quoteGroupUsage } from '../group-quote'

const model: SavingsModel = {
  modelName: 'demo',
  vendorName: 'Demo',
  family: 'other',
  baseInputPrice: 10,
  baseOutputPrice: 20,
  baseCacheReadPrice: 1,
  baseCacheWritePrice: 2,
  siteInputPrice: 10,
  siteOutputPrice: 20,
  siteCacheReadPrice: 1,
  siteCacheWritePrice: 2,
  savingsPercent: 0,
}

describe('describeGroupDiscount', () => {
  it('calls ratio 1 list price and 0.5 five-off', () => {
    expect(describeGroupDiscount(1)).toEqual({ kind: 'original' })
    expect(describeGroupDiscount(0.5)).toEqual({ kind: 'off', zhe: 5 })
    expect(describeGroupDiscount(1.2)).toEqual({ kind: 'markup', times: 1.2 })
  })
})

describe('quoteGroupUsage', () => {
  it('scales list rates and estimates a 95% cache-hit input', () => {
    const quote = quoteGroupUsage(model, 0.5)
    expect(quote.input).toBe(5)
    expect(quote.output).toBe(10)
    expect(quote.cacheHitInput).toBeCloseTo(5 * 0.05 + 0.5 * 0.95)
    expect(quote.savingsPercent).toBe(50)
  })
})
