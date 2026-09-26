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
import type { CatalogModel } from '@/lib/queries'
import type { ModelRanking } from '@/lib/services'

import { featuredEntries } from '../router-sections'

const model = (name: string) => ({ model_name: name, vendor: 'Vendor' }) as CatalogModel
const ranked = (name: string, rank: number) =>
  ({ model_name: name, rank, vendor: 'Vendor', total_tokens: 1000, growth_pct: 0 }) as ModelRanking

describe('featuredEntries', () => {
  it('lists every model, the ranked ones first with their usage', () => {
    const entries = featuredEntries([model('a'), model('b'), model('c')], [ranked('c', 1)])
    expect(entries.map((entry) => entry.model.model_name)).toEqual(['c', 'a', 'b'])
    expect(entries[0].ranking?.rank).toBe(1)
    expect(entries[1].ranking).toBeUndefined()
  })

  it('leaves out ranked models the catalog no longer has', () => {
    const entries = featuredEntries([model('a')], [ranked('gone', 1), ranked('a', 2)])
    expect(entries.map((entry) => entry.model.model_name)).toEqual(['a'])
  })

  it('still lists every model when rankings are switched off', () => {
    expect(featuredEntries([model('a'), model('b')], []).map((entry) => entry.model.model_name)).toEqual(['a', 'b'])
  })
})
