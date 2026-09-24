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
import { coarsen, decodeLand, decodeLights } from '../world-map-data'

const encode = (...bytes: number[]) => btoa(String.fromCharCode(...bytes))

describe('decodeLand', () => {
  it('reads one bit per cell, least significant bit first', () => {
    const land = decodeLand(encode(0b0000_0101), 4, 2)
    expect(Array.from(land.cells)).toEqual([1, 0, 1, 0, 0, 0, 0, 0])
  })
})

describe('decodeLights', () => {
  it('reads varint gaps between lit cells and their brightness', () => {
    // gap 0 → cell 0; gap 2 → cell 3; gap 128 (two varint bytes) → cell 132
    const lights = decodeLights(encode(0x00, 200, 0x02, 50, 0x80, 0x01, 255), 200, 1)
    expect(Array.from(lights.index)).toEqual([0, 3, 132])
    expect(Array.from(lights.level)).toEqual([200, 50, 255])
  })
})

describe('coarsen', () => {
  const grid = {
    cols: 6,
    rows: 2,
    // one land cell | mostly land | sea
    cells: Uint8Array.from([0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0]),
  }

  it('keeps blocks that are at least a third land', () => {
    const merged = coarsen(grid, 2)
    expect(merged.cols).toBe(3)
    expect(merged.rows).toBe(1)
    expect(Array.from(merged.cells)).toEqual([0, 1, 0])
  })

  it('returns the grid unchanged at full resolution', () => {
    expect(coarsen(grid, 1)).toBe(grid)
  })
})
