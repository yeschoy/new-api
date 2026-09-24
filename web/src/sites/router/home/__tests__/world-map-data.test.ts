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
import { coarsen, decodeWorld } from '../world-map-data'

describe('decodeWorld', () => {
  it('unpacks two cells per byte, low nibble first', () => {
    const encoded = btoa(String.fromCharCode(0x21, 0xf0))
    expect(Array.from(decodeWorld(encoded, 2, 2).cells)).toEqual([1, 2, 0, 15])
  })
})

describe('coarsen', () => {
  const grid = {
    cols: 6,
    rows: 2,
    // sea with one light | mostly land | one land cell in sea
    cells: Uint8Array.from([0, 0, 1, 1, 1, 0, 0, 5, 1, 0, 0, 0]),
  }

  it('keeps the brightest light, keeps mostly-land blocks and drops stray land', () => {
    const merged = coarsen(grid, 2)
    expect(merged.cols).toBe(3)
    expect(merged.rows).toBe(1)
    expect(Array.from(merged.cells)).toEqual([5, 1, 0])
  })

  it('returns the grid unchanged at full resolution', () => {
    expect(coarsen(grid, 1)).toBe(grid)
  })
})
