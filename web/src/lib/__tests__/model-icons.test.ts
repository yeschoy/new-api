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
import { guessIcon } from '../model-icons'

describe('guessIcon', () => {
  it.each([
    ['grok-4.7', 'xAI', 'Grok'],
    ['mimo-v2.6-pro', undefined, 'XiaomiMiMo'],
    ['kimi-k3', 'Moonshot AI', 'Kimi.Color'],
    ['hy4-preview', 'Tencent', 'Hunyuan.Color'],
    ['seed-2.1-pro', undefined, 'Doubao.Color'],
  ])('gives %s its family icon', (model, vendor, icon) => {
    expect(guessIcon(model, vendor)).toBe(icon)
  })

  it('falls back to the vendor when the model name says nothing', () => {
    expect(guessIcon('house-special', 'xAI')).toBe('Grok')
  })

  it('leaves unknown models to the letter fallback', () => {
    expect(guessIcon('house-special', 'Somebody')).toBeUndefined()
  })
})
