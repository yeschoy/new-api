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
import { useEffect, useRef } from 'react'

import { useTheme } from '@/site/theme'

import { coarsen, decodeWorld, type WorldGrid } from './world-map-data'

/** Smallest gap between dot centres in CSS px; finer grids get merged. */
const MIN_PITCH = 2.6
/** Seconds: one light switching on, nightfall crossing the map, lights fading at dawn. */
const RAMP = 0.3
const SWEEP = 1.2
const FADE_OUT = 0.4

let worldData: Promise<WorldGrid> | null = null

/** The map data is about 60 KB, so it loads in its own chunk after the page. */
function loadWorld(): Promise<WorldGrid> {
  worldData ??= import('./world-night').then((m) => decodeWorld(m.WORLD_CELLS, m.WORLD_COLS, m.WORLD_ROWS))
  return worldData
}

const AMBER = [255, 150, 60]
const GOLD = [255, 200, 110]
const WARM_WHITE = [255, 246, 220]

function mix(from: number[], to: number[], t: number): string {
  return from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',')
}

/** A crisp light for one level (2–15); only the brighter ones get a faint halo. */
function lightSprite(level: number, pitch: number, dpr: number): HTMLCanvasElement {
  const t = (level - 2) / 13
  const core = pitch * (0.2 + 0.24 * t) * dpr
  const halo = t > 0.45 ? pitch * (0.9 + 1.1 * t) * dpr : 0
  const size = Math.ceil(2 * Math.max(core, halo)) + 2
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite
  const c = size / 2
  if (halo > 0) {
    const glow = ctx.createRadialGradient(c, c, 0, c, c, halo)
    glow.addColorStop(0, `rgba(255,190,100,${0.06 + 0.22 * t})`)
    glow.addColorStop(1, 'rgba(255,190,100,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)
  }
  const rgb = t < 0.5 ? mix(AMBER, GOLD, t * 2) : mix(GOLD, WARM_WHITE, (t - 0.5) * 2)
  ctx.fillStyle = `rgba(${rgb},${0.3 + 0.7 * t})`
  ctx.beginPath()
  ctx.arc(c, c, core, 0, Math.PI * 2)
  ctx.fill()
  return sprite
}

type Light = { x: number; y: number; sprite: HTMLCanvasElement; delay: number }
type Scene = { base: HTMLCanvasElement; lights: Light[]; last: number }

/** Sizes the canvas and pre-renders the land dots; lights are positioned in device pixels. */
function buildScene(canvas: HTMLCanvasElement, world: WorldGrid, night: boolean): Scene {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const fine = Math.min(w / world.cols, h / world.rows)
  const grid = coarsen(world, Math.max(1, Math.ceil(MIN_PITCH / fine)))
  const pitch = Math.min(w / grid.cols, h / grid.rows)
  const ox = (w - pitch * grid.cols) / 2
  const oy = (h - pitch * grid.rows) / 2

  const base = document.createElement('canvas')
  base.width = canvas.width
  base.height = canvas.height
  const b = base.getContext('2d')
  const sprites = new Map<number, HTMLCanvasElement>()
  const lights: Light[] = []
  let last = 0
  if (!b) return { base, lights, last }
  b.scale(dpr, dpr)
  b.fillStyle = night ? 'rgba(252,252,254,0.07)' : 'rgba(3,8,10,0.17)'
  b.beginPath()
  const r = Math.max(0.5, pitch * 0.26)
  for (let i = 0; i < grid.cells.length; i += 1) {
    const value = grid.cells[i]
    if (value === 0) continue
    const gx = i % grid.cols
    const cx = ox + (gx + 0.5) * pitch
    const cy = oy + (Math.floor(i / grid.cols) + 0.5) * pitch
    b.moveTo(cx + r, cy)
    b.arc(cx, cy, r, 0, Math.PI * 2)
    if (value < 2) continue
    let sprite = sprites.get(value)
    if (!sprite) {
      sprite = lightSprite(value, pitch, dpr)
      sprites.set(value, sprite)
    }
    // Night falls from east to west, with a little jitter per light.
    const seed = Math.sin(i * 12.9898) * 43758.5453
    const delay = (1 - (gx + 0.5) / grid.cols) * SWEEP + (seed - Math.floor(seed)) * 0.35
    last = Math.max(last, delay)
    lights.push({
      x: Math.round(cx * dpr - sprite.width / 2),
      y: Math.round(cy * dpr - sprite.height / 2),
      sprite,
      delay,
    })
  }
  b.fill()
  return { base, lights, last }
}

/**
 * Fine dotted world map behind the home hero. By day it is a quiet grey
 * stipple; by night the land goes dark and real city lights (NASA Black
 * Marble) switch on from east to west.
 */
export function WorldMap(props: { className?: string }) {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const litBefore = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const night = theme === 'dark'
    const fadeOut = !night && litBefore.current
    litBefore.current = night
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancelled = false
    let frame = 0
    let start = 0
    let scene: Scene | null = null
    let resize: ResizeObserver | null = null

    /** Draws one frame; returns whether the animation is still running. */
    const draw = (now: number): boolean => {
      if (!scene) return false
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(scene.base, 0, 0)
      const s = reduceMotion ? Infinity : (now - start) / 1000
      if (night) {
        for (const light of scene.lights) {
          const on = Math.min(1, (s - light.delay) / RAMP)
          if (on <= 0) continue
          ctx.globalAlpha = on
          ctx.drawImage(light.sprite, light.x, light.y)
        }
        ctx.globalAlpha = 1
        return s < scene.last + RAMP
      }
      const on = fadeOut ? 1 - s / FADE_OUT : 0
      if (on <= 0) return false
      ctx.globalAlpha = on
      for (const light of scene.lights) ctx.drawImage(light.sprite, light.x, light.y)
      ctx.globalAlpha = 1
      return true
    }

    const loop = (now: number) => {
      frame = draw(now) ? window.requestAnimationFrame(loop) : 0
    }

    // Build only once the canvas has a size: a page opened in a hidden tab
    // lays out at 0×0 and gets its real size when it is first shown.
    void loadWorld().then((world) => {
      if (cancelled) return
      let size = ''
      resize = new ResizeObserver(() => {
        const next = `${canvas.clientWidth}x${canvas.clientHeight}`
        if (canvas.clientWidth === 0 || canvas.clientHeight === 0 || next === size) return
        const first = scene === null
        size = next
        scene = buildScene(canvas, world, night)
        if (first) {
          start = performance.now()
          loop(start)
        } else if (!frame) {
          draw(Infinity)
        }
      })
      resize.observe(canvas)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      resize?.disconnect()
    }
  }, [theme])

  return <canvas ref={canvasRef} aria-hidden='true' className={props.className} />
}
