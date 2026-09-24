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
import { MAP_WEST, mapLon, rollColumns } from '../world-projection'

describe('Pacific-centred projection', () => {
  it('starts at the left edge and puts 150°E in the middle', () => {
    expect(mapLon(MAP_WEST)).toBe(0)
    expect(mapLon(150)).toBe(180)
  })

  it('places China left of the Pacific and the US right of it', () => {
    expect(mapLon(116.4)).toBeLessThan(180) // Beijing
    expect(mapLon(-122.42)).toBeGreaterThan(180) // San Francisco
  })
})

describe('rollColumns', () => {
  it('moves the given column to the left edge, wrapping the rest round', () => {
    const grid = { cols: 4, rows: 2, cells: Uint8Array.from([1, 0, 0, 0, 0, 1, 0, 0]) }
    expect(Array.from(rollColumns(grid, 1).cells)).toEqual([0, 0, 0, 1, 1, 0, 0, 0])
  })
})
