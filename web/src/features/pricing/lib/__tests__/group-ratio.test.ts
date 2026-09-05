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

import type { PricingModel } from '../../types'
import {
  formatModelGroupRatioRange,
  resolveModelGroupRatios,
} from '../group-ratio'

function pricingModel(
  name: string,
  groups: string[],
  ratios?: Record<string, number>
): PricingModel {
  return {
    id: 0,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: groups,
    group_ratio: ratios,
  }
}

describe('pricing model group ratios', () => {
  it('prefers the model-specific customer matrix over the group fallback', () => {
    const fallback = { default: 0.7, SVIP: 0.25 }
    const model = pricingModel('deepseek-v4-pro', ['default', 'SVIP'], {
      default: 0.8,
      SVIP: 0.6,
    })

    expect(resolveModelGroupRatios(model, fallback)).toEqual({
      default: 0.8,
      SVIP: 0.6,
    })
    expect(
      resolveModelGroupRatios(pricingModel('other', ['default']), fallback)
    ).toBe(fallback)
  })

  it('summarizes only models available to the selected group', () => {
    const models = [
      pricingModel('flash', ['SVIP'], { SVIP: 0.25 }),
      pricingModel('pro', ['SVIP'], { SVIP: 0.6 }),
      pricingModel('retail-only', ['default'], { default: 0.8 }),
    ]

    expect(formatModelGroupRatioRange(models, 'SVIP', 0.21)).toBe('x0.25-0.6')
    expect(formatModelGroupRatioRange(models, 'VIP', 0.35)).toBe('x0.35')
  })
})
