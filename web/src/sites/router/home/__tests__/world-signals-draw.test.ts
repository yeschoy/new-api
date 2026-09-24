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
import { signalRgb } from '../world-signals-draw'

describe('signalRgb', () => {
  it('pales the lime primary towards white at night so the lines are not too green', () => {
    expect(signalRgb('#c8ff00', true)).toBe('233,255,153')
  })

  it('keeps the violet primary by day', () => {
    expect(signalRgb('#7624f4', false)).toBe('118,36,244')
  })
})
