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
import { useEffect, useRef, useState } from 'react'

import { ROUTER_CHART } from '@/components/stacked-bars'
import { getLang, localeOf } from '@/i18n/i18n'

/** The site's chart palette (the rankings use it too); "other" takes its last, neutral colour. */
const PALETTE = ROUTER_CHART.palette.slice(0, -1)
export const OTHER_COLOR = ROUTER_CHART.palette[ROUTER_CHART.palette.length - 1]

export function colorAt(index: number): string {
  return PALETTE[index % PALETTE.length]
}

/** How many named series a chart shows before the rest become "other". */
export const SERIES_LIMIT = PALETTE.length

/** Round axis steps (1, 2, 2.5, 5 × 10ⁿ) from zero to at least `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? 10 * power
  const steps = Math.ceil(max / step - 1e-9)
  return Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toPrecision(12)))
}

/** A share as a percentage in the page language: 0.75 → "75%". */
export function formatShare(share: number): string {
  return (Number.isFinite(share) ? share : 0).toLocaleString(localeOf(getLang()), { style: 'percent', maximumFractionDigits: 1 })
}

/** Width of an element as it resizes, so charts draw at real pixels (readable text on phones). */
export function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const update = () => {
      if (element.clientWidth > 0) setWidth(element.clientWidth)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}
