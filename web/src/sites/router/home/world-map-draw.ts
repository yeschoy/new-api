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
import { coarsen, type LandGrid, type LightGrid } from './world-map-data'
import { cellCenter, rollColumns, westShift } from './world-projection'
import { nightness, sunElevation, type LonLat } from './world-sun'

/** Smallest gap between land dots in CSS px; finer grids get merged. */
const MIN_PITCH = 2.6
/** Land dots step from their daylight to their night opacity in this many levels. */
const DOT_LEVELS = 4
/** Brightness boost and curve for the lights; higher reads as more lit. */
const GAIN = 1.6
const CURVE = 0.7
/** Glow: how much the lights are shrunk to blur them. */
const GLOW_SHRINK = 8

/** Colours per page theme: land dots on the day and night side of the Earth, and the light ramp. */
const PALETTE = {
  dark: {
    dot: '252,252,254',
    // On a dark page the sunlit land stands out and the night side goes dim.
    dayDot: 0.13,
    nightDot: 0.05,
    lights: [[255, 150, 60], [255, 205, 120], [255, 247, 228]],
    glow: 0.55,
  },
  light: {
    dot: '3,8,10',
    // On a light page the night side's land darkens.
    dayDot: 0.17,
    nightDot: 0.3,
    // White lights would vanish on a light page, so they deepen to orange instead.
    lights: [[250, 175, 80], [240, 140, 40], [222, 100, 18]],
    glow: 0.35,
  },
}

type Box = { cols: number; rows: number }

/** Sizes the canvas for the device and fits the map (contain) into it. */
function fit(canvas: HTMLCanvasElement, grid: Box) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const cell = Math.min(w / grid.cols, h / grid.rows)
  return { dpr, cell, ox: (w - cell * grid.cols) / 2, oy: (h - cell * grid.rows) / 2 }
}

function nightAt(col: number, row: number, grid: Box, sun: LonLat): number {
  const [lon, lat] = cellCenter(col, row, grid.cols, grid.rows)
  return nightness(sunElevation(lat, lon, sun))
}

/**
 * The land as a dotted stipple following the real sun: dots on the night side
 * of the Earth take their night opacity, easing across the terminator.
 */
export function paintLand(canvas: HTMLCanvasElement, land: LandGrid, pageNight: boolean, sun: LonLat) {
  const { dpr, cell, ox, oy } = fit(canvas, land)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const theme = pageNight ? PALETTE.dark : PALETTE.light
  const k = Math.max(1, Math.ceil(MIN_PITCH / cell))
  const grid = coarsen(rollColumns(land, westShift(land.cols)), k)
  const pitch = cell * k
  const r = Math.max(0.5, pitch * 0.26)
  const levels = Array.from({ length: DOT_LEVELS }, () => new Path2D())
  for (let i = 0; i < grid.cells.length; i += 1) {
    if (!grid.cells[i]) continue
    const gx = i % grid.cols
    const gy = Math.floor(i / grid.cols)
    const n = nightAt(gx * k + (k - 1) / 2, gy * k + (k - 1) / 2, land, sun)
    const path = levels[Math.round(n * (DOT_LEVELS - 1))]
    const cx = ox + (gx + 0.5) * pitch
    const cy = oy + (gy + 0.5) * pitch
    path.moveTo(cx + r, cy)
    path.arc(cx, cy, r, 0, Math.PI * 2)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  levels.forEach((path, level) => {
    const t = level / (DOT_LEVELS - 1)
    ctx.fillStyle = `rgba(${theme.dot},${theme.dayDot + (theme.nightDot - theme.dayDot) * t})`
    ctx.fill(path)
  })
}

function mix(from: number[], to: number[], t: number, out: Uint8ClampedArray, at: number) {
  for (let c = 0; c < 3; c += 1) out[at + c] = from[c] + (to[c] - from[c]) * t
}

/**
 * City lights where it is night right now, written straight onto device
 * pixels so they stay sharp at any size, with a soft glow underneath. They
 * fade in through twilight; cells smaller than a pixel add up.
 */
export function paintLights(canvas: HTMLCanvasElement, lights: LightGrid, pageNight: boolean, sun: LonLat) {
  const { dpr, cell, ox, oy } = fit(canvas, lights)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const theme = pageNight ? PALETTE.dark : PALETTE.light
  const W = canvas.width
  const H = canvas.height
  const cellPx = cell * dpr
  const size = Math.max(1, Math.round(cellPx))
  const weight = Math.min(1, cellPx * cellPx) / 255
  const sum = new Float32Array(W * H)
  const shift = westShift(lights.cols)
  for (let n = 0; n < lights.index.length; n += 1) {
    const i = lights.index[n]
    const col = i % lights.cols
    const ly = (i - col) / lights.cols
    const lx = (col - shift + lights.cols) % lights.cols
    const dark = nightAt(lx, ly, lights, sun)
    if (dark <= 0) continue
    const x0 = Math.floor((ox + (lx + 0.5) * cell) * dpr - size / 2)
    const y0 = Math.floor((oy + (ly + 0.5) * cell) * dpr - size / 2)
    const v = lights.level[n] * weight * dark
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + size); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + size); x += 1) sum[y * W + x] += v
    }
  }

  const [low, mid, high] = theme.lights
  const image = ctx.createImageData(W, H)
  const px = image.data
  for (let p = 0; p < sum.length; p += 1) {
    if (sum[p] <= 0) continue
    const t = Math.min(1, GAIN * sum[p] ** CURVE)
    const at = p * 4
    if (t < 0.5) mix(low, mid, t * 2, px, at)
    else mix(mid, high, (t - 0.5) * 2, px, at)
    px[at + 3] = 255 * Math.min(1, 0.06 + t)
  }
  ctx.putImageData(image, 0, 0)

  // Glow: shrink the lights hard (which blurs them) and stretch them back
  // underneath the sharp ones.
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.ceil(W / GLOW_SHRINK))
  small.height = Math.max(1, Math.ceil(H / GLOW_SHRINK))
  const s = small.getContext('2d')
  if (!s) return
  s.imageSmoothingQuality = 'high'
  s.drawImage(canvas, 0, 0, small.width, small.height)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.globalAlpha = theme.glow
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
