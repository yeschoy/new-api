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
import { applyFilters, EMPTY_FILTERS } from '../model-filters'
import type { CatalogModel } from '../queries'

function model(partial: Partial<CatalogModel> & { model_name: string }): CatalogModel {
  return {
    id: 1,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    vendor: 'OpenAI',
    ...partial,
  }
}

const catalog = [
  model({ model_name: 'cheap-text', model_ratio: 0.1, context_length: 32_000, release_date: '2026-01-01' }),
  model({ model_name: 'vision-pro', vendor: 'Google', model_ratio: 2, context_length: 1_000_000, input_modalities: ['text', 'image'], capabilities: ['vision'], release_date: '2026-09-01' }),
  model({ model_name: 'per-request', quota_type: 1, model_price: 0.02, release_date: '2026-05-01' }),
]

describe('applyFilters', () => {
  it('matches the search query against model and vendor names', () => {
    expect(applyFilters(catalog, { ...EMPTY_FILTERS, query: 'google' }).map((m) => m.model_name)).toEqual(['vision-pro'])
  })

  it('keeps only models that accept every selected input modality', () => {
    const result = applyFilters(catalog, { ...EMPTY_FILTERS, inputModalities: ['image'] })
    expect(result.map((m) => m.model_name)).toEqual(['vision-pro'])
  })

  it('excludes per-request models when an input price ceiling is set', () => {
    const result = applyFilters(catalog, { ...EMPTY_FILTERS, maxInputUsd: 1 })
    expect(result.map((m) => m.model_name)).toEqual(['cheap-text'])
  })

  it('drops models below the minimum context window', () => {
    const result = applyFilters(catalog, { ...EMPTY_FILTERS, minContext: 128_000 })
    expect(result.map((m) => m.model_name)).toEqual(['vision-pro'])
  })

  it('sorts newest first by release date by default', () => {
    expect(applyFilters(catalog, EMPTY_FILTERS).map((m) => m.model_name)).toEqual(['vision-pro', 'per-request', 'cheap-text'])
  })

  it('puts per-request models last when sorting by ascending input price', () => {
    const result = applyFilters(catalog, { ...EMPTY_FILTERS, sort: 'price-asc' })
    expect(result.map((m) => m.model_name)).toEqual(['cheap-text', 'vision-pro', 'per-request'])
  })
})
