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

import { paintLand, paintLights } from './world-map-draw'
import { decodeLand, decodeLights, type LandGrid, type LightGrid } from './world-map-data'
import { subsolarPoint } from './world-sun'

// The map data loads in its own chunks after the page: the land (15 KB) and
// the city lights (80 KB).
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

/** Day and night move across the map by about a pixel a minute, so it repaints once a minute. */
const REPAINT_MS = 60_000

/**
 * Paints a map layer whenever its canvas gets a new, non-zero size (a page
 * opened in a hidden tab lays out at 0×0 until it is first shown) and again
 * every minute as the sun moves. Returns the cleanup.
 */
function keepPainted(canvas: HTMLCanvasElement, paint: () => void): () => void {
  let size = ''
  const observer = new ResizeObserver(() => {
    const next = `${canvas.clientWidth}x${canvas.clientHeight}`
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0 || next === size) return
    size = next
    paint()
  })
  observer.observe(canvas)
  const timer = window.setInterval(() => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) paint()
  }, REPAINT_MS)
  return () => {
    observer.disconnect()
    window.clearInterval(timer)
  }
}

/**
 * Dotted world map on the home page showing real day and night: wherever the
 * sun has set right now, the city lights (NASA Black Marble) are on. The page
 * theme only sets the colours.
 */
export function WorldMap(props: { className?: string }) {
  const { theme } = useTheme()
  const pageNight = theme === 'dark'
  const landRef = useRef<HTMLCanvasElement>(null)
  const lightsRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = landRef.current
    if (!canvas) return
    let stop = () => {}
    let cancelled = false
    void loadLand().then((land) => {
      if (cancelled) return
      stop = keepPainted(canvas, () => paintLand(canvas, land, pageNight, subsolarPoint(Date.now())))
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [pageNight])

  useEffect(() => {
    const canvas = lightsRef.current
    if (!canvas) return
    let stop = () => {}
    let cancelled = false
    void loadLights().then((lights) => {
      if (cancelled) return
      stop = keepPainted(canvas, () => {
        paintLights(canvas, lights, pageNight, subsolarPoint(Date.now()))
        canvas.setAttribute('data-ready', '')
      })
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [pageNight])

  return (
    <div aria-hidden='true' className={props.className}>
      <canvas ref={landRef} className='absolute inset-0 size-full' />
      <canvas ref={lightsRef} className='world-lights absolute inset-0 size-full' />
    </div>
  )
}
