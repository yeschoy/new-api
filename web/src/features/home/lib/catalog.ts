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
import { ENDPOINT_TYPES } from '@/features/pricing/constants'

import type { SavingsModel } from './pricing-savings'

export type CatalogModality = 'all' | 'text' | 'image' | 'video'
export type CatalogSort = 'discount-desc' | 'discount-asc' | 'price-asc'

const IMAGE_ENDPOINTS = new Set<string>([ENDPOINT_TYPES.IMAGE_GENERATION])
const VIDEO_ENDPOINTS = new Set<string>([ENDPOINT_TYPES.OPENAI_VIDEO])

export function getCatalogModality(
  model: SavingsModel
): Exclude<CatalogModality, 'all'> {
  const endpoints = model.endpointTypes ?? []
  if (endpoints.some((endpoint) => VIDEO_ENDPOINTS.has(endpoint))) {
    return 'video'
  }
  if (endpoints.some((endpoint) => IMAGE_ENDPOINTS.has(endpoint))) {
    return 'image'
  }
  return 'text'
}

export function filterCatalog(
  models: SavingsModel[],
  query: string,
  vendor: string,
  modality: CatalogModality
): SavingsModel[] {
  const needle = query.trim().toLowerCase()
  return models.filter((model) => {
    if (vendor && vendor !== 'all' && model.vendorName !== vendor) {
      return false
    }
    if (modality !== 'all' && getCatalogModality(model) !== modality) {
      return false
    }
    if (!needle) return true
    return (
      model.modelName.toLowerCase().includes(needle) ||
      model.vendorName.toLowerCase().includes(needle)
    )
  })
}

export function sortCatalog(
  models: SavingsModel[],
  sort: CatalogSort
): SavingsModel[] {
  const sorted = [...models]
  switch (sort) {
    case 'discount-asc':
      sorted.sort(
        (left, right) =>
          left.savingsPercent - right.savingsPercent ||
          left.modelName.localeCompare(right.modelName)
      )
      break
    case 'price-asc':
      sorted.sort(
        (left, right) =>
          left.siteOutputPrice - right.siteOutputPrice ||
          left.siteInputPrice - right.siteInputPrice ||
          left.modelName.localeCompare(right.modelName)
      )
      break
    default:
      sorted.sort(
        (left, right) =>
          right.savingsPercent - left.savingsPercent ||
          left.siteOutputPrice - right.siteOutputPrice ||
          left.modelName.localeCompare(right.modelName)
      )
  }
  return sorted
}

export function uniqueVendors(models: SavingsModel[]): string[] {
  return [...new Set(models.map((model) => model.vendorName))].sort(
    (left, right) => left.localeCompare(right)
  )
}

export function catalogVendorAvatar(model: SavingsModel): string {
  if (model.vendorIcon) return model.vendorIcon
  switch (model.family) {
    case 'openai':
      return '/ci/lobe/openai-avatar.svg'
    case 'anthropic':
      return '/ci/lobe/claude-avatar.svg'
    case 'google':
      return '/ci/lobe/gemini-avatar.svg'
    case 'deepseek':
      return '/ci/lobe/deepseek-avatar.svg'
    default:
      return '/ci/lobe/zai-avatar.svg'
  }
}

export function familyIconName(model: SavingsModel): string {
  if (model.vendorIcon) return model.vendorIcon
  switch (model.family) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Claude.Color'
    case 'google':
      return 'Gemini.Color'
    case 'deepseek':
      return 'DeepSeek.Color'
    case 'moonshot':
      return 'Kimi.Color'
    case 'qwen':
      return 'Qwen.Color'
    default:
      return model.vendorName
  }
}
