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

/** Local decoration only: one paint per pointer frame, no React state or tilt. */
export function useOfferSpotlight(enabled: boolean) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return

    const pointer = window.matchMedia(
      '(min-width: 761px) and (hover: hover) and (pointer: fine)'
    )
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let x = 0
    let y = 0

    function reset() {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      element?.removeAttribute('data-spotlight')
      element?.style.removeProperty('--offer-pointer-x')
      element?.style.removeProperty('--offer-pointer-y')
    }

    function paint() {
      frame = 0
      if (!element || !pointer.matches || motion.matches) return
      const rect = element.getBoundingClientRect()
      element.style.setProperty('--offer-pointer-x', `${x - rect.left}px`)
      element.style.setProperty('--offer-pointer-y', `${y - rect.top}px`)
      element.dataset.spotlight = 'true'
    }

    function move(event: PointerEvent) {
      if (
        !pointer.matches ||
        motion.matches ||
        event.pointerType !== 'mouse' ||
        event.buttons !== 0
      ) {
        reset()
        return
      }
      x = event.clientX
      y = event.clientY
      if (!frame) frame = window.requestAnimationFrame(paint)
    }

    element.addEventListener('pointermove', move, { passive: true })
    element.addEventListener('pointerleave', reset)
    element.addEventListener('pointerdown', reset)
    element.addEventListener('keydown', reset)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', reset)
    pointer.addEventListener('change', reset)
    motion.addEventListener('change', reset)
    return () => {
      reset()
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', reset)
      element.removeEventListener('pointerdown', reset)
      element.removeEventListener('keydown', reset)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', reset)
      pointer.removeEventListener('change', reset)
      motion.removeEventListener('change', reset)
    }
  }, [enabled])

  return ref
}
