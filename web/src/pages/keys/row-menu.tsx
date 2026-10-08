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
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ICON_BUTTON } from './key-value'

export type MenuEntry =
  | { kind: 'item'; label: string; icon?: LucideIcon; onSelect: () => void }
  | { kind: 'section'; label: string }

const WIDTH = 220
const GAP = 4
const EDGE = 8

type Position = { top: number; left: number }

/** Below the button, right-aligned with it; above it when there is no room below. */
function place(trigger: DOMRect, height: number): Position {
  const left = Math.max(EDGE, Math.min(trigger.right - WIDTH, window.innerWidth - WIDTH - EDGE))
  const below = trigger.bottom + GAP
  if (below + height <= window.innerHeight - EDGE) return { top: below, left }
  return { top: Math.max(EDGE, trigger.top - GAP - height), left }
}

function items(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : []
}

/**
 * A "more" button whose menu floats over the page (outside the scrolling table,
 * which would clip it). Closes on a pick, Escape, a click elsewhere, scrolling
 * or resizing; arrow keys move between items.
 */
export function RowMenu(props: { label: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    setPosition(place(triggerRef.current.getBoundingClientRect(), menuRef.current?.offsetHeight ?? 0))
    items(menuRef.current)[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close()
    }
    // The page moving would leave the menu behind; scrolling the menu itself is fine.
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function onKeyDown(event: React.KeyboardEvent) {
    const list = items(menuRef.current)
    const index = list.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }
    if (!(event.key in moves) || !list.length) return
    event.preventDefault()
    list[(moves[event.key] + list.length) % list.length]?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        aria-label={props.label}
        title={props.label}
        aria-haspopup='menu'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={ICON_BUTTON}
      >
        <Ellipsis className='size-4' aria-hidden='true' />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role='menu'
              aria-label={props.label}
              onKeyDown={onKeyDown}
              style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: WIDTH }}
              className='border-or-line bg-or-card text-or-fg fixed z-50 max-h-[70vh] overflow-y-auto rounded-[8px] border p-1 shadow-xl'
            >
              {props.entries.map((entry, index) => {
                if (entry.kind === 'section') {
                  return (
                    <div key={`section-${index}`} role='presentation' className='text-or-dim border-or-line mt-1 border-t px-3 pt-2 pb-1 text-[12px]'>
                      {entry.label}
                    </div>
                  )
                }
                const Icon = entry.icon
                return (
                  <button
                    key={`${entry.label}-${index}`}
                    type='button'
                    role='menuitem'
                    tabIndex={-1}
                    onClick={() => {
                      setOpen(false)
                      triggerRef.current?.focus()
                      entry.onSelect()
                    }}
                    className='hover:bg-or-fill focus:bg-or-fill flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] outline-none'
                  >
                    {Icon ? <Icon className='text-or-muted size-4 shrink-0' aria-hidden='true' /> : null}
                    <span className='min-w-0 truncate'>{entry.label}</span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
