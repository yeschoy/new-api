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
import type { CatalogModel } from '../queries'

import { defaultModel, withPinned } from '../pinned-models'

const model = (name: string, vendor = 'Vendor') => ({ model_name: name, vendor }) as CatalogModel

describe('withPinned', () => {
  it('adds the pinned models the catalog lacks, with their vendor and family icon', () => {
    const models = withPinned([model('gpt-6-sol', 'OpenAI'), model('glm-5.3', '智谱')])
    expect(models.find((m) => m.model_name === 'claude-opus-5-5')).toMatchObject({ vendor: 'Anthropic', vendorIcon: 'Claude.Color' })
    expect(models.filter((m) => m.model_name === 'gpt-6-sol')).toHaveLength(1)
    expect(models.map((m) => m.model_name)).toContain('glm-5.3')
  })
})

describe('defaultModel', () => {
  it('picks the first pinned model the catalog has', () => {
    expect(defaultModel([model('glm-5.3'), model('gpt-6-sol')])).toBe('gpt-6-sol')
  })

  it('falls back to the first name when no pinned model is there', () => {
    expect(defaultModel([model('qwen3.8-max'), model('glm-5.3')])).toBe('glm-5.3')
  })
})
