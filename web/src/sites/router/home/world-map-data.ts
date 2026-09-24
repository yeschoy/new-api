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

/** Row-major land mask: 1 land, 0 sea. */
export type LandGrid = { cols: number; rows: number; cells: Uint8Array }

/** Lit cells of a finer grid over the same area, in row-major order. */
export type LightGrid = { cols: number; rows: number; index: Uint32Array; level: Uint8Array }

function bytesOf(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
}

/** Unpacks the land mask (one bit per cell, least significant bit first). */
export function decodeLand(encoded: string, cols: number, rows: number): LandGrid {
  const bytes = bytesOf(encoded)
  const cells = new Uint8Array(cols * rows)
  for (let i = 0; i < cells.length; i += 1) {
    cells[i] = (bytes[i >> 3] >> (i & 7)) & 1
  }
  return { cols, rows, cells }
}

/** Reads the sparse lights: per lit cell a varint gap since the previous one, then its brightness. */
export function decodeLights(encoded: string, cols: number, rows: number): LightGrid {
  const bytes = bytesOf(encoded)
  const index: number[] = []
  const level: number[] = []
  let at = -1
  let i = 0
  while (i < bytes.length) {
    let gap = 0
    let shift = 0
    let byte = 0
    do {
      byte = bytes[i]
      i += 1
      gap += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    at += gap + 1
    index.push(at)
    level.push(bytes[i])
    i += 1
  }
  return { cols, rows, index: Uint32Array.from(index), level: Uint8Array.from(level) }
}

/** Merges k×k blocks so dots stay a few pixels apart on narrow screens; a block is land when a third of it is. */
export function coarsen(grid: LandGrid, k: number): LandGrid {
  if (k <= 1) return grid
  const cols = Math.ceil(grid.cols / k)
  const rows = Math.ceil(grid.rows / k)
  const cells = new Uint8Array(cols * rows)
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      let land = 0
      for (let y = by * k; y < Math.min(grid.rows, (by + 1) * k); y += 1) {
        for (let x = bx * k; x < Math.min(grid.cols, (bx + 1) * k); x += 1) {
          land += grid.cells[y * grid.cols + x]
        }
      }
      if (land * 3 >= k * k) cells[by * cols + bx] = 1
    }
  }
  return { cols, rows, cells }
}
