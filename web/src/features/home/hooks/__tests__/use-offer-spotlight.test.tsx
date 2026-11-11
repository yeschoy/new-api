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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOfferSpotlight } from '../use-offer-spotlight'

let finePointer: boolean
let reducedMotion: boolean
let frames: Map<number, FrameRequestCallback>
let frameId: number
let renders: number
let listeners: Set<EventListenerOrEventListenerObject>

function Harness(props: { enabled?: boolean }) {
  renders++
  const ref = useOfferSpotlight(props.enabled !== false)
  return (
    <section ref={ref} data-testid='offer'>
      <button type='button'>Action</button>
    </section>
  )
}

function move(element: HTMLElement, pointerType = 'mouse', x = 120, y = 180) {
  const event = new MouseEvent('pointermove', {
    clientX: x,
    clientY: y,
    bubbles: true,
  })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  fireEvent(element, event)
}

function draw() {
  const callbacks = [...frames.values()]
  frames.clear()
  act(() => {
    for (const callback of callbacks) callback(16)
  })
}

beforeEach(() => {
  finePointer = true
  reducedMotion = false
  frames = new Map()
  listeners = new Set()
  frameId = 0
  renders = 0
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const media = original(query)
    Object.defineProperty(media, 'matches', {
      get: () =>
        query.includes('prefers-reduced-motion') ? reducedMotion : finePointer,
    })
    vi.spyOn(media, 'addEventListener').mockImplementation(
      (_event, listener) => {
        listeners.add(listener)
      }
    )
    vi.spyOn(media, 'removeEventListener').mockImplementation(
      (_event, listener) => {
        listeners.delete(listener)
      }
    )
    return media
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('offer spotlight', () => {
  it('coalesces pointer events into one local paint without React renders', () => {
    render(<Harness />)
    const offer = screen.getByTestId('offer')
    const measure = vi
      .spyOn(offer, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(20, 30, 400, 500))
    move(offer)
    move(offer, 'mouse', 160, 220)
    expect(frames.size).toBe(1)
    expect(window.matchMedia).toHaveBeenCalledWith(
      '(min-width: 761px) and (hover: hover) and (pointer: fine)'
    )
    expect(measure).not.toHaveBeenCalled()
    draw()
    expect(offer).toHaveAttribute('data-spotlight', 'true')
    expect(offer.style.getPropertyValue('--offer-pointer-x')).toBe('140px')
    expect(offer.style.getPropertyValue('--offer-pointer-y')).toBe('190px')
    expect(measure).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    expect(renders).toBe(1)
  })

  it.each(['touch', 'coarse', 'narrow screen', 'reduced motion', 'disabled'])(
    'does not request pointer paints for %s',
    (mode) => {
      finePointer = mode !== 'coarse' && mode !== 'narrow screen'
      reducedMotion = mode === 'reduced motion'
      render(<Harness enabled={mode !== 'disabled'} />)
      const offer = screen.getByTestId('offer')
      move(offer, mode === 'touch' ? 'touch' : 'mouse')
      expect(frames.size).toBe(0)
      expect(offer).not.toHaveAttribute('data-spotlight')
    }
  )

  it('cancels queued work on leave and clears the light on keyboard navigation or blur', () => {
    render(<Harness />)
    const offer = screen.getByTestId('offer')
    move(offer)
    fireEvent.pointerLeave(offer)
    expect(frames.size).toBe(0)
    move(offer)
    draw()
    fireEvent.keyDown(offer, { key: 'Tab' })
    expect(offer).not.toHaveAttribute('data-spotlight')
    expect(offer.style.getPropertyValue('--offer-pointer-x')).toBe('')
    move(offer)
    draw()
    fireEvent.blur(window)
    expect(offer).not.toHaveAttribute('data-spotlight')
  })

  it('respects motion preference changes immediately and releases pending frames and listeners', () => {
    const view = render(<Harness />)
    const offer = screen.getByTestId('offer')
    move(offer)
    draw()
    move(offer)
    expect(frames.size).toBe(1)
    reducedMotion = true
    act(() => {
      for (const listener of listeners) {
        const event = new Event('change')
        if (typeof listener === 'function') listener(event)
        else listener.handleEvent(event)
      }
    })
    expect(frames.size).toBe(0)
    expect(offer).not.toHaveAttribute('data-spotlight')
    reducedMotion = false
    move(offer)
    expect(frames.size).toBe(1)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(listeners.size).toBe(0)
    move(offer)
    expect(frames.size).toBe(0)
  })
})
