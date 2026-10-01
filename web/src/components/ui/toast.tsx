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
import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/format'

type Toast = { id: number; tone: 'success' | 'error'; text: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function push(tone: Toast['tone'], text: string) {
  const id = nextId++
  toasts = [...toasts, { id, tone, text }]
  emit()
  window.setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id)
    emit()
  }, 4000)
}

/** Short messages at the bottom of the screen: saved, failed, copied. */
export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Where toasts appear; mounted once by the app's root layout. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => toasts)
  if (!items.length) return null
  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4'>
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'border-or-line bg-or-card pointer-events-auto max-w-[480px] rounded-[8px] border px-4 py-2.5 text-[14px] shadow-xl',
            item.tone === 'error' ? 'text-or-red' : 'text-or-fg'
          )}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}
