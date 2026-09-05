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
import type { PricingModel } from '../types'

export function resolveModelGroupRatios(
  model: PricingModel,
  fallbackRatios: Record<string, number>
): Record<string, number> {
  return model.group_ratio ?? fallbackRatios
}

function formatGroupRatio(ratio: number | undefined): string | undefined {
  if (ratio == null) return undefined
  const formatted = Number.isInteger(ratio)
    ? ratio.toString()
    : ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `x${formatted}`
}

export function formatModelGroupRatioRange(
  models: PricingModel[],
  group: string,
  fallbackRatio: number | undefined
): string | undefined {
  const ratios = models
    .filter((model) => model.enable_groups?.includes(group))
    .map((model) => model.group_ratio?.[group] ?? fallbackRatio)
    .filter(
      (ratio): ratio is number =>
        typeof ratio === 'number' && Number.isFinite(ratio)
    )

  if (ratios.length === 0) return formatGroupRatio(fallbackRatio)

  const min = Math.min(...ratios)
  const max = Math.max(...ratios)
  if (min === max) return formatGroupRatio(min)

  const minLabel = formatGroupRatio(min)?.slice(1)
  const maxLabel = formatGroupRatio(max)?.slice(1)
  return `x${minLabel}-${maxLabel}`
}
