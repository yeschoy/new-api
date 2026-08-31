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
import { useReducedMotion } from 'motion/react'
import { useCallback, useRef } from 'react'

type PointerGlassOptions = {
  tilt?: boolean
  maxTilt?: number
  lift?: boolean
}

function setVar(node: HTMLElement, name: string, value: string) {
  node.style.setProperty(name, value)
}

export function usePointerGlass<T extends HTMLElement = HTMLElement>(
  options?: PointerGlassOptions
) {
  const ref = useRef<T | null>(null)
  const frame = useRef(0)
  const reduced = useReducedMotion()

  const reset = useCallback(() => {
    const node = ref.current
    if (!node) return
    setVar(node, '--glass-x', '50%')
    setVar(node, '--glass-y', '12%')
    setVar(node, '--glass-rx', '0deg')
    setVar(node, '--glass-ry', '0deg')
    setVar(node, '--glass-lift', '0px')
    setVar(node, '--glass-scale', '1')
    setVar(node, '--glass-press', '0')
  }, [])

  const track = useCallback(
    (event: React.PointerEvent<T>) => {
      const node = ref.current
      if (!node || reduced) return
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height
      const maxTilt = options?.maxTilt ?? 8
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        setVar(node, '--glass-x', `${Math.min(Math.max(px, 0), 1) * 100}%`)
        setVar(node, '--glass-y', `${Math.min(Math.max(py, 0), 1) * 100}%`)
        if (options?.lift !== false) {
          setVar(node, '--glass-lift', '-3px')
          setVar(node, '--glass-scale', '1.03')
        }
        if (options?.tilt) {
          setVar(node, '--glass-rx', `${(0.5 - py) * maxTilt}deg`)
          setVar(node, '--glass-ry', `${(px - 0.5) * maxTilt}deg`)
        }
      })
    },
    [options?.lift, options?.maxTilt, options?.tilt, reduced]
  )

  const press = useCallback(() => {
    const node = ref.current
    if (!node || reduced || options?.lift === false) return
    setVar(node, '--glass-lift', '0px')
    setVar(node, '--glass-scale', '0.97')
    setVar(node, '--glass-press', '1')
  }, [options?.lift, reduced])

  const release = useCallback(
    (event: React.PointerEvent<T>) => {
      const node = ref.current
      if (!node || reduced) return
      setVar(node, '--glass-press', '0')
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      track(event)
    },
    [reduced, track]
  )

  return {
    ref,
    onPointerMove: track,
    onPointerEnter: track,
    onPointerLeave: reset,
    onPointerDown: press,
    onPointerUp: release,
    onPointerCancel: reset,
  }
}
