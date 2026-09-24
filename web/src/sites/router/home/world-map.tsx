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

import { cn } from '@/lib/format'
import { useTheme } from '@/site/theme'

import { paintLand, paintLights } from './world-map-draw'
import { decodeLand, decodeLights, type LandGrid, type LightGrid } from './world-map-data'
import { buildSignals, drawSignals, type SignalScene } from './world-signals-draw'

// The map data loads in its own chunks after the page: the land (15 KB)
// right away, the lights (80 KB) only once night is first shown.
let landData: Promise<LandGrid> | null = null
let lightData: Promise<LightGrid> | null = null

function loadLand(): Promise<LandGrid> {
  landData ??= import('./world-land').then((m) => decodeLand(m.LAND_BITS, m.LAND_COLS, m.LAND_ROWS))
  return landData
}

function loadLights(): Promise<LightGrid> {
  lightData ??= import('./world-lights').then((m) => decodeLights(m.LIGHTS, m.LIGHT_COLS, m.LIGHT_ROWS))
  return lightData
}

/**
 * Repaints a canvas whenever it gets a new, non-zero size. A page opened in a
 * hidden tab lays out at 0×0 and only gets its real size when first shown.
 */
function paintOnResize(canvas: HTMLCanvasElement, paint: () => void): () => void {
  let size = ''
  const observer = new ResizeObserver(() => {
    const next = `${canvas.clientWidth}x${canvas.clientHeight}`
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0 || next === size) return
    size = next
    paint()
  })
  observer.observe(canvas)
  return () => observer.disconnect()
}

/**
 * Dotted world map on the home page. By day the land is a quiet grey
 * stipple; at night real city lights (NASA Black Marble) come on, sweeping in
 * from east to west. On top, relay traffic runs between cities worldwide.
 */
export function WorldMap(props: { className?: string }) {
  const { theme } = useTheme()
  const night = theme === 'dark'
  const landRef = useRef<HTMLCanvasElement>(null)
  const lightsRef = useRef<HTMLCanvasElement>(null)
  const signalsRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = landRef.current
    if (!canvas) return
    let stop = () => {}
    let cancelled = false
    void loadLand().then((land) => {
      if (!cancelled) stop = paintOnResize(canvas, () => paintLand(canvas, land, night))
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [night])

  useEffect(() => {
    const canvas = lightsRef.current
    if (!night || !canvas) return
    let stop = () => {}
    let cancelled = false
    void loadLights().then((lights) => {
      if (cancelled) return
      let first = true
      stop = paintOnResize(canvas, () => {
        paintLights(canvas, lights)
        if (!first) return
        first = false
        // Restart the east-to-west sweep now that the lights are drawn.
        canvas.removeAttribute('data-on')
        void canvas.offsetWidth
        canvas.setAttribute('data-on', '')
      })
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [night])

  // Relay traffic: redrawn every frame while the map is on screen; with
  // reduced motion only the routes are shown.
  useEffect(() => {
    const canvas = signalsRef.current
    if (!canvas) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let scene: SignalScene | null = null
    let frame = 0
    let visible = true
    const tick = (now: number) => {
      if (!scene) return
      drawSignals(canvas, scene, now / 1000)
      frame = window.requestAnimationFrame(tick)
    }
    const run = () => {
      if (!still && visible && scene && !frame) frame = window.requestAnimationFrame(tick)
    }
    const pause = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
    }
    const stopResize = paintOnResize(canvas, () => {
      scene = buildSignals(canvas)
      drawSignals(canvas, scene, still ? null : performance.now() / 1000)
      run()
    })
    const onScreen = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) run()
      else pause()
    })
    onScreen.observe(canvas)
    return () => {
      pause()
      stopResize()
      onScreen.disconnect()
    }
  }, [night])

  return (
    <div aria-hidden='true' className={props.className}>
      <canvas ref={landRef} className='absolute inset-0 size-full' />
      <canvas
        ref={lightsRef}
        className={cn(
          'world-lights absolute inset-0 size-full transition-opacity duration-500',
          night ? 'opacity-100' : 'opacity-0'
        )}
      />
      <canvas ref={signalsRef} className='absolute inset-0 size-full' />
    </div>
  )
}
