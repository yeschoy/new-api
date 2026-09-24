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
import { LAT_SPAN, LAT_TOP, mapLon } from './world-projection'
import {
  CALLS,
  CHINA_SITES,
  US_SITES,
  arcControl,
  callPhase,
  nearestCopy,
  pointOnArc,
  type LonLat,
  type Point,
} from './world-signals'

// Everything on this layer is hairline-thin and faint so the map stays in front.
/** Request streak: a short fine thread, as a share of the route. */
const TAIL = 0.12
const TAIL_STEPS = 5
const STREAK_WIDTH = 0.6
const STREAK_ALPHA = 0.55
/** Routes: a faint shadow at rest, a little brighter while a call is on them. */
const ROUTE_WIDTH = 0.4
const ROUTE_REST = 0.02
const ROUTE_LIT = 0.07
const ROUTE_LEVELS = 4
/** How far the lime night primary is paled towards white. */
const NIGHT_PALE = 0.6

/** A call's route in CSS px; `copies` are x offsets for routes that wrap round the map edge. */
type Leg = { a: Point; c: Point; b: Point; copies: number[]; every: number; offset: number }
export type SignalScene = { still: HTMLCanvasElement; legs: Leg[]; rgb: string; dpr: number }

/**
 * Signal colour as "r,g,b": the brand primary by day; at night the lime
 * primary paled towards white so the traffic reads as light, not green.
 */
export function signalRgb(hex: string, night: boolean): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  const rgb = match ? [match[1], match[2], match[3]].map((part) => parseInt(part, 16)) : [118, 36, 244]
  if (!night) return rgb.join(',')
  return rgb.map((v) => Math.round(v + (255 - v) * NIGHT_PALE)).join(',')
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * Sizes the canvas and pre-renders the faint routes, the callers and the
 * model sites (colour read from the page, so it follows the day/night theme).
 */
export function buildSignals(canvas: HTMLCanvasElement): SignalScene {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const scale = Math.min(w / 360, h / LAT_SPAN)
  const mapW = 360 * scale
  const ox = (w - mapW) / 2
  const oy = (h - LAT_SPAN * scale) / 2
  const project = (p: LonLat): Point => ({ x: ox + mapLon(p[0]) * scale, y: oy + (LAT_TOP - p[1]) * scale })
  const night = document.documentElement.classList.contains('dark')
  const rgb = signalRgb(getComputedStyle(canvas).getPropertyValue('--or-primary'), night)
  const legs = CALLS.map((call, i) => {
    const a = project(call.from)
    const to = project(call.to)
    const b = { x: nearestCopy(a.x, to.x, mapW), y: to.y }
    const copies = [0]
    if (Math.min(a.x, b.x) < ox) copies.push(mapW)
    if (Math.max(a.x, b.x) > ox + mapW) copies.push(-mapW)
    const offset = ((i * 0.618) % 1) * call.every
    return { a, b, c: arcControl(a, b), copies, every: call.every, offset }
  })

  const still = document.createElement('canvas')
  still.width = canvas.width
  still.height = canvas.height
  const ctx = still.getContext('2d')
  if (!ctx) return { still, legs, rgb, dpr }
  ctx.scale(dpr, dpr)
  const routes = new Path2D()
  for (const leg of legs) {
    for (const dx of leg.copies) {
      routes.moveTo(leg.a.x + dx, leg.a.y)
      routes.quadraticCurveTo(leg.c.x + dx, leg.c.y, leg.b.x + dx, leg.b.y)
    }
  }
  ctx.lineWidth = ROUTE_WIDTH
  ctx.strokeStyle = `rgba(${rgb},${ROUTE_REST})`
  ctx.stroke(routes)

  const dots = (points: Point[], core: number, halo: number, haloAlpha: number) => {
    const glow = new Path2D()
    const body = new Path2D()
    for (const p of points) {
      glow.moveTo(p.x + halo, p.y)
      glow.arc(p.x, p.y, halo, 0, Math.PI * 2)
      body.moveTo(p.x + core, p.y)
      body.arc(p.x, p.y, core, 0, Math.PI * 2)
    }
    ctx.fillStyle = `rgba(${rgb},${haloAlpha})`
    ctx.fill(glow)
    ctx.fillStyle = `rgba(${rgb},0.7)`
    ctx.fill(body)
  }
  dots([...new Set(CALLS.map((call) => call.from))].map(project), 0.8, 2, 0.08)
  dots([...CHINA_SITES, ...US_SITES].map(project), 1.6, 3.5, 0.12)
  return { still, legs, rgb, dpr }
}

function ripple(ctx: CanvasRenderingContext2D, x: number, y: number, q: number, rgb: string, reach: number) {
  ctx.strokeStyle = `rgba(${rgb},${0.3 * (1 - q)})`
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.arc(x, y, 2 + reach * q, 0, Math.PI * 2)
  ctx.stroke()
}

/** The request: a fine thread fading in towards a tiny bright head, flying from the caller to the model. */
function request(ctx: CanvasRenderingContext2D, leg: Leg, dx: number, progress: number, rgb: string) {
  const head = ease(progress)
  const tail = Math.max(0, head - TAIL)
  ctx.lineWidth = STREAK_WIDTH
  let prev = pointOnArc(leg.a, leg.c, leg.b, tail)
  for (let s = 1; s <= TAIL_STEPS; s += 1) {
    const p = pointOnArc(leg.a, leg.c, leg.b, tail + ((head - tail) * s) / TAIL_STEPS)
    ctx.strokeStyle = `rgba(${rgb},${STREAK_ALPHA * (s / TAIL_STEPS)})`
    ctx.beginPath()
    ctx.moveTo(prev.x + dx, prev.y)
    ctx.lineTo(p.x + dx, p.y)
    ctx.stroke()
    prev = p
  }
  ctx.fillStyle = `rgba(${rgb},0.85)`
  ctx.beginPath()
  ctx.arc(prev.x + dx, prev.y, 0.9, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * One frame of traffic: requests flying to the models, a pulse while each
 * model works, the answer streaming back token by token, and a ripple when it
 * reaches the caller. `seconds` null draws the still routes only.
 */
export function drawSignals(canvas: HTMLCanvasElement, scene: SignalScene, seconds: number | null) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(scene.still, 0, 0)
  if (seconds === null) return
  ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0)
  ctx.lineCap = 'round'
  const phases = scene.legs.map((leg) => callPhase(seconds, leg.every, leg.offset))

  // Routes carrying a call show faintly, grouped into a few brightness levels.
  const lit = Array.from({ length: ROUTE_LEVELS }, () => new Path2D())
  scene.legs.forEach((leg, i) => {
    if (phases[i].route <= 0) return
    const path = lit[Math.min(ROUTE_LEVELS - 1, Math.floor(phases[i].route * ROUTE_LEVELS))]
    for (const dx of leg.copies) {
      path.moveTo(leg.a.x + dx, leg.a.y)
      path.quadraticCurveTo(leg.c.x + dx, leg.c.y, leg.b.x + dx, leg.b.y)
    }
  })
  ctx.lineWidth = ROUTE_WIDTH
  lit.forEach((path, level) => {
    ctx.strokeStyle = `rgba(${scene.rgb},${(ROUTE_LIT * (level + 1)) / ROUTE_LEVELS})`
    ctx.stroke(path)
  })

  const tokens = new Path2D()
  scene.legs.forEach((leg, i) => {
    const phase = phases[i]
    for (const dx of leg.copies) {
      if (phase.request !== null) request(ctx, leg, dx, phase.request, scene.rgb)
      if (phase.think !== null) ripple(ctx, leg.b.x + dx, leg.b.y, phase.think, scene.rgb, 5)
      if (phase.arrive !== null) ripple(ctx, leg.a.x + dx, leg.a.y, phase.arrive, scene.rgb, 7)
      for (const t of phase.tokens) {
        const p = pointOnArc(leg.a, leg.c, leg.b, 1 - t)
        tokens.moveTo(p.x + dx + 0.6, p.y)
        tokens.arc(p.x + dx, p.y, 0.6, 0, Math.PI * 2)
      }
    }
  })
  ctx.fillStyle = `rgba(${scene.rgb},0.55)`
  ctx.fill(tokens)
}
