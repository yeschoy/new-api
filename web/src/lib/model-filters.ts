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
import type { CatalogModel } from './queries'
import type { Modality } from './services'

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'context' | 'name'

export type ModelFilters = {
  query: string
  vendors: string[]
  inputModalities: Modality[]
  outputModality: Modality | 'all'
  minContext: number
  maxInputUsd: number | null
  capabilities: string[]
  sort: SortKey
}

export const EMPTY_FILTERS: ModelFilters = {
  query: '',
  vendors: [],
  inputModalities: [],
  outputModality: 'all',
  minContext: 0,
  maxInputUsd: null,
  capabilities: [],
  sort: 'newest',
}

export const MODALITY_LABELS: Record<Modality, string> = {
  text: '文本',
  image: '图像',
  file: '文件',
  audio: '音频',
  video: '视频',
}

export const CAPABILITY_LABELS: Record<string, string> = {
  tool_calling: '工具调用',
  reasoning: '推理',
  vision: '视觉',
  structured_output: '结构化输出',
  streaming: '流式输出',
}

export function outputsOf(model: CatalogModel): Modality[] {
  return model.output_modalities?.length ? model.output_modalities : ['text']
}

export function inputsOf(model: CatalogModel): Modality[] {
  return model.input_modalities?.length ? model.input_modalities : ['text']
}

/** USD per 1M input tokens, or null for per-request models. */
export function inputUsd(model: CatalogModel): number | null {
  return model.quota_type === 0 ? model.model_ratio * 2 : null
}

export function applyFilters(models: CatalogModel[], filters: ModelFilters): CatalogModel[] {
  const q = filters.query.trim().toLowerCase()
  const result = models.filter((model) => {
    if (q) {
      const haystack = `${model.model_name} ${model.vendor} ${model.description ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filters.vendors.length && !filters.vendors.includes(model.vendor)) return false
    const inputs = inputsOf(model)
    if (filters.inputModalities.some((m) => !inputs.includes(m))) return false
    if (filters.outputModality !== 'all' && !outputsOf(model).includes(filters.outputModality)) return false
    if (filters.minContext && (model.context_length ?? 0) < filters.minContext) return false
    if (filters.maxInputUsd !== null) {
      const price = inputUsd(model)
      if (price === null || price > filters.maxInputUsd) return false
    }
    const caps = model.capabilities ?? []
    if (filters.capabilities.some((c) => !caps.includes(c))) return false
    return true
  })
  return sortModels(result, filters.sort)
}

export function sortModels(models: CatalogModel[], sort: SortKey): CatalogModel[] {
  const list = [...models]
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => (inputUsd(a) ?? Infinity) - (inputUsd(b) ?? Infinity))
    case 'price-desc':
      return list.sort((a, b) => (inputUsd(b) ?? -1) - (inputUsd(a) ?? -1))
    case 'context':
      return list.sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    case 'name':
      return list.sort((a, b) => a.model_name.localeCompare(b.model_name))
    default:
      return list.sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.model_name.localeCompare(b.model_name))
  }
}

export function countBy<T extends string>(models: CatalogModel[], pick: (m: CatalogModel) => T[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const model of models) {
    for (const key of pick(model)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}
