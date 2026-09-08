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

import { estimateGatewayListSavings } from '../console-money'

function model(name: string, savingsPercent: number): SavingsModel {
  return {
    modelName: name,
    vendorName: 'Test',
    family: 'other',
    baseInputPrice: 1,
    baseOutputPrice: 1,
    baseCacheReadPrice: null,
    baseCacheWritePrice: null,
    siteInputPrice: 1,
    siteOutputPrice: 1,
    siteCacheReadPrice: null,
    siteCacheWritePrice: null,
    savingsPercent,
  }
}

describe('estimateGatewayListSavings', () => {
  it('converts charged quota back to gateway-list savings', () => {
    const saved = estimateGatewayListSavings(
      [{ quota: 400000, model_name: 'demo' }],
      [model('demo', 60)]
    )
    expect(saved).toBeCloseTo(600000)
  })

  it('ignores models without a catalog discount', () => {
    expect(
      estimateGatewayListSavings(
        [{ quota: 400000, model_name: 'demo' }],
        [model('demo', 0)]
      )
    ).toBe(0)
  })
})
