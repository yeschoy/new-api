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
import { render, screen, within } from '@testing-library/react'

import type { CatalogModel } from '@/lib/queries'

import { FeaturedModels } from '../router-sections'

const model = { model_name: 'glm-5.3', vendor: 'Zhipu', quota_type: 0, model_ratio: 1, completion_ratio: 4 } as CatalogModel

describe('FeaturedModels', () => {
  it('shows token usage and weekly trend, never prices, for a model without usage figures', () => {
    render(<FeaturedModels rows={[]} catalog={[model]} modelCount={1} vendorCount={1} />)
    // The first card is a pinned model with no usage figures yet.
    const card = within(screen.getAllByRole('article')[0])
    expect(card.getByText('Token 用量')).toBeInTheDocument()
    expect(card.getByText('周趋势')).toBeInTheDocument()
    expect(card.getAllByText('--')).toHaveLength(2)
    expect(card.queryByText('输入价格')).not.toBeInTheDocument()
  })
})
