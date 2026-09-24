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

export type Point = { x: number; y: number }
/** Longitude, latitude in degrees. */
export type LonLat = readonly [number, number]
/** One model call on the map: a caller, the model site that answers, and seconds between calls. */
export type Call = { from: LonLat; to: LonLat; every: number }

/** Where large models are built and served, in China. */
const CN = {
  beijing: [116.4, 39.9], // Zhipu, Moonshot, Baidu, ByteDance
  hangzhou: [120.16, 30.27], // Alibaba Qwen, DeepSeek
  shanghai: [121.47, 31.23], // MiniMax, StepFun
  shenzhen: [114.06, 22.54], // Tencent Hunyuan, Huawei Pangu
  ulanqab: [113.13, 41.03], // national compute hubs from here down
  zhongwei: [105.19, 37.51],
  chengdu: [104.07, 30.57],
  guiyang: [106.63, 26.65],
} satisfies Record<string, LonLat>

/** Where large models are built and served, in the US. */
const US = {
  bayArea: [-122.42, 37.77], // OpenAI, Anthropic, Google, Meta
  seattle: [-122.33, 47.61], // Microsoft, Amazon
  abilene: [-99.73, 32.45], // Stargate
  memphis: [-90.05, 35.15], // xAI Colossus
  desMoines: [-93.6, 41.6], // Microsoft Azure AI
  ashburn: [-77.49, 39.04], // Northern Virginia data centres
} satisfies Record<string, LonLat>

export const CHINA_SITES: readonly LonLat[] = Object.values(CN)
export const US_SITES: readonly LonLat[] = Object.values(US)

/** Chinese cities calling US models. */
export const CHINA_CALLERS: readonly LonLat[] = [
  [116.4, 39.9], [121.47, 31.23], [113.26, 23.13], [114.06, 22.54], [120.16, 30.27], [104.07, 30.57],
  [114.31, 30.59], [108.94, 34.34], [118.8, 32.06], [106.55, 29.56], [117.2, 39.08], [114.17, 22.32],
]

/** US cities calling Chinese models. */
export const US_CALLERS: readonly LonLat[] = [
  [-74.01, 40.71], [-118.24, 34.05], [-87.63, 41.88], [-95.37, 29.76], [-97.74, 30.27], [-71.06, 42.36],
  [-122.42, 37.77], [-122.33, 47.61], [-80.19, 25.76], [-104.99, 39.74], [-84.39, 33.75], [-77.04, 38.91],
]

/** Cities elsewhere calling both. */
const WORLD_CALLERS: readonly LonLat[] = [
  // Americas
  [-79.38, 43.65], [-123.12, 49.28], [-99.13, 19.43], [-74.07, 4.71], [-77.04, -12.05],
  [-46.63, -23.55], [-43.17, -22.91], [-58.38, -34.6], [-70.67, -33.45],
  // Europe
  [-0.13, 51.51], [2.35, 48.86], [13.4, 52.52], [8.68, 50.11], [4.9, 52.37],
  [-3.7, 40.42], [12.5, 41.9], [18.07, 59.33], [21.01, 52.23], [37.62, 55.76], [28.98, 41.01],
  // Middle East and Africa
  [55.27, 25.2], [46.68, 24.71], [31.24, 30.04], [3.38, 6.52], [36.82, -1.29], [28.05, -26.2], [-7.59, 33.57],
  // South and Southeast Asia
  [72.88, 19.08], [77.21, 28.61], [77.59, 12.97], [90.41, 23.81], [100.5, 13.76], [106.63, 10.82],
  [103.82, 1.35], [101.69, 3.14], [106.85, -6.21], [120.98, 14.6],
  // Japan, Korea, Oceania
  [126.98, 37.57], [139.69, 35.69], [135.5, 34.69], [151.21, -33.87], [144.96, -37.81], [174.76, -36.85],
]

/**
 * Model calls on the home map. China and the US call each other the most and
 * the most often; every other city calls a model in each of them.
 */
export const CALLS: readonly Call[] = [
  ...CHINA_CALLERS.flatMap((from, i) =>
    [0, 1].map((k) => ({ from, to: US_SITES[(i + k * 3) % US_SITES.length], every: 2.8 + ((i + k) % 5) * 0.2 }))
  ),
  ...US_CALLERS.flatMap((from, i) =>
    [0, 1].map((k) => ({ from, to: CHINA_SITES[(i * 3 + k * 5) % CHINA_SITES.length], every: 2.9 + ((i + 2 * k) % 5) * 0.2 }))
  ),
  ...WORLD_CALLERS.flatMap((from, i) => [
    { from, to: US_SITES[i % US_SITES.length], every: 4.6 + (i % 7) * 0.35 },
    { from, to: CHINA_SITES[i % CHINA_SITES.length], every: 4.8 + ((i + 3) % 7) * 0.35 },
  ]),
]

/** Seconds: request flight, model at work, and the ripple at the caller. */
export const REQUEST = 0.9
export const THINK = 0.35
export const RIPPLE = 0.8
/** The answer streams back as tokens leaving one after another. */
export const TOKENS = 8
export const TOKEN_GAP = 0.08
export const TOKEN_TRAVEL = 1.0
/** Seconds the route takes to show as a request leaves, and to fade once the model answers. */
export const FADE_IN = 0.3
export const FADE_OUT = 1.2

/**
 * Where a call is in its loop. `request` and `think` run 0–1 (null when
 * idle); `tokens` lists how far each streamed token has come back from the
 * model (0 at the model, 1 at the caller); `arrive` is the caller's ripple;
 * `route` is how visible the route is: it lights as the request goes out and
 * fades while the answer streams back, so lines come and go.
 */
export type CallPhase = {
  request: number | null
  think: number | null
  tokens: number[]
  arrive: number | null
  route: number
}

function routeVisibility(c: number): number {
  const answered = REQUEST + THINK
  if (c < FADE_IN) return c / FADE_IN
  if (c < answered) return 1
  if (c < answered + FADE_OUT) return 1 - (c - answered) / FADE_OUT
  return 0
}

export function callPhase(seconds: number, period: number, offset: number): CallPhase {
  const c = (((seconds + offset) % period) + period) % period
  const answer = c - REQUEST - THINK
  const tokens: number[] = []
  for (let i = 0; i < TOKENS; i += 1) {
    const p = (answer - i * TOKEN_GAP) / TOKEN_TRAVEL
    if (p > 0 && p < 1) tokens.push(p)
  }
  const landed = answer - TOKEN_TRAVEL
  return {
    request: c < REQUEST ? c / REQUEST : null,
    think: c >= REQUEST && c < REQUEST + THINK ? (c - REQUEST) / THINK : null,
    tokens,
    arrive: landed >= 0 && landed < RIPPLE ? landed / RIPPLE : null,
    route: routeVisibility(c),
  }
}

/** The copy of x (shifted by a map width) closest to `from`, so routes take the short way round. */
export function nearestCopy(from: number, x: number, width: number): number {
  if (x - from > width / 2) return x - width
  if (from - x > width / 2) return x + width
  return x
}

/** Control point that bows a route into an arc, toward the top of the map. */
export function arcControl(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  let nx = -dy / length
  let ny = dx / length
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const lift = length * 0.28
  return { x: (a.x + b.x) / 2 + nx * lift, y: (a.y + b.y) / 2 + ny * lift }
}

/** Point at t (0–1) along the quadratic arc a → b with control point c. */
export function pointOnArc(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  }
}
