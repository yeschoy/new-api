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
import { heroStats } from '../router-hero'

describe('heroStats', () => {
  it('shows weekly tokens, models and vendors, with no protocol count', () => {
    const stats = heroStats({ weeklyTokens: 1_234_567, modelCount: 42, vendorCount: 9 })
    expect(stats.map((stat) => stat.label)).toEqual(['本周 Token', '模型', '厂商'])
  })

  it('shows nothing before any data has loaded', () => {
    expect(heroStats({ weeklyTokens: 0, modelCount: 0, vendorCount: 0 })).toEqual([])
  })
})
