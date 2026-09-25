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
import { cellCenter, rollColumns, westShift } from '../world-projection'

describe('Pacific-centred map', () => {
  it('starts the map at 30°W so the Pacific sits in the middle', () => {
    // One column per degree from 180°W: 30°W is column 150.
    expect(westShift(360)).toBe(150)
    expect(westShift(1440)).toBe(600)
  })
})

describe('cellCenter', () => {
  it('gives the longitude and latitude at the middle of a map cell', () => {
    // A 1° grid over 30°W eastwards and 80°N to 58°S.
    expect(cellCenter(0, 0, 360, 138)).toEqual([-29.5, 79.5])
    expect(cellCenter(179, 137, 360, 138)).toEqual([149.5, -57.5])
  })
})

describe('rollColumns', () => {
  it('moves the given column to the left edge, wrapping the rest round', () => {
    const grid = { cols: 4, rows: 2, cells: Uint8Array.from([1, 0, 0, 0, 0, 1, 0, 0]) }
    expect(Array.from(rollColumns(grid, 1).cells)).toEqual([0, 0, 0, 1, 1, 0, 0, 0])
  })
})
