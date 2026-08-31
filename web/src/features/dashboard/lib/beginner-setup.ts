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
import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
import { getAvailableGroups } from '@/features/pricing/lib/model-helpers'
import type { PricingModel } from '@/features/pricing/types'

export type UsableGroupMap = Record<string, { desc: string; ratio: number }>

export type RateGroupOption = {
  id: string
  desc: string
  ratio: number
}

export function modelsForUser(
  models: PricingModel[],
  usableGroup: UsableGroupMap
): PricingModel[] {
  return models.filter(
    (model) => getAvailableGroups(model, usableGroup).length > 0
  )
}

export function rateGroupsForModel(
  model: PricingModel | null,
  usableGroup: UsableGroupMap,
  groupRatio: Record<string, number>
): RateGroupOption[] {
  if (!model) return []
  return getAvailableGroups(model, usableGroup)
    .filter((id) => !EXCLUDED_GROUPS.includes(id))
    .map((id) => {
      const configured = groupRatio[id]
      const fromUsable = usableGroup[id]?.ratio
      const ratio =
        typeof configured === 'number' && Number.isFinite(configured)
          ? configured
          : typeof fromUsable === 'number' && Number.isFinite(fromUsable)
            ? fromUsable
            : 1
      return {
        id,
        desc: usableGroup[id]?.desc || id,
        ratio,
      }
    })
    .sort((a, b) => a.ratio - b.ratio)
}

export function ratioTone(ratio: number): 'cheaper' | 'same' | 'costlier' {
  if (ratio < 1) return 'cheaper'
  if (ratio > 1) return 'costlier'
  return 'same'
}
