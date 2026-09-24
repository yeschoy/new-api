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

/** Row-major cells: 0 sea, 1 unlit land, 2–15 night-light level. */
export type WorldGrid = { cols: number; rows: number; cells: Uint8Array }

/** Unpacks the generated map data (two 4-bit cells per byte, low nibble first). */
export function decodeWorld(encoded: string, cols: number, rows: number): WorldGrid {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const cells = new Uint8Array(cols * rows)
  for (let i = 0; i < cells.length; i += 1) {
    cells[i] = (bytes[i >> 1] >> ((i & 1) * 4)) & 15
  }
  return { cols, rows, cells }
}

/**
 * Merges k×k blocks so dots stay a few pixels apart on narrow screens. A block
 * keeps its brightest light; an unlit block is land when a third of it is land.
 */
export function coarsen(grid: WorldGrid, k: number): WorldGrid {
  if (k <= 1) return grid
  const cols = Math.ceil(grid.cols / k)
  const rows = Math.ceil(grid.rows / k)
  const cells = new Uint8Array(cols * rows)
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      let brightest = 0
      let land = 0
      for (let y = by * k; y < Math.min(grid.rows, (by + 1) * k); y += 1) {
        for (let x = bx * k; x < Math.min(grid.cols, (bx + 1) * k); x += 1) {
          const value = grid.cells[y * grid.cols + x]
          if (value > 0) land += 1
          if (value > brightest) brightest = value
        }
      }
      if (brightest >= 2) cells[by * cols + bx] = brightest
      else if (land * 3 >= k * k) cells[by * cols + bx] = 1
    }
  }
  return { cols, rows, cells }
}
