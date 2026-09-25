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
import type { LandGrid } from './world-map-data'

/**
 * The home map is centred on the Pacific (150°E), like world maps printed in
 * China: the left edge is 30°W. The data grids start at 180°W and are rolled
 * to this left edge when drawn.
 */
const MAP_WEST = -30
/** Latitude range of the map (see world-land.ts). */
const LAT_TOP = 80
const LAT_SPAN = 138

/** Longitude and latitude at the middle of a cell of a map grid (already rolled to MAP_WEST). */
export function cellCenter(col: number, row: number, cols: number, rows: number): readonly [number, number] {
  return [MAP_WEST + ((col + 0.5) * 360) / cols, LAT_TOP - ((row + 0.5) * LAT_SPAN) / rows]
}

/** Grid columns to skip so that a grid starting at 180°W begins at MAP_WEST. */
export function westShift(cols: number): number {
  return Math.round(((MAP_WEST + 180) / 360) * cols)
}

/** Returns the grid with column `shift` moved to the left edge and the rest wrapped round. */
export function rollColumns(grid: LandGrid, shift: number): LandGrid {
  const cells = new Uint8Array(grid.cells.length)
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      cells[y * grid.cols + x] = grid.cells[y * grid.cols + ((x + shift) % grid.cols)]
    }
  }
  return { cols: grid.cols, rows: grid.rows, cells }
}
