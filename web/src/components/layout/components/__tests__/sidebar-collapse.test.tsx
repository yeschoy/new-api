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
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest'

import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

let stylesheet: HTMLStyleElement
beforeEach(() => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../styles/dopamine.css'
    ),
    'utf8'
  )
  document.head.append(stylesheet)
})
afterEach(() => {
  stylesheet.remove()
  document.cookie = 'sidebar_state=; Max-Age=0; path=/'
})

describe.each(['sidebar', 'floating', 'inset'] as const)(
  '%s sidebar',
  (variant) => {
    it.each(['icon', 'offcanvas'] as const)(
      'releases the expanded gap when collapsed to %s and restores it on reopen',
      async (collapsible) => {
        const user = userEvent.setup()
        const view = render(
          <SidebarProvider className='dopa-console--developer'>
            <SidebarTrigger />
            <Sidebar variant={variant} collapsible={collapsible}>
              Navigation
            </Sidebar>
          </SidebarProvider>
        )
        const gap = view.container.querySelector<HTMLElement>(
          '[data-slot="sidebar-gap"]'
        )
        assert(gap)
        const expandedSize = getComputedStyle(gap).inlineSize
        expect(expandedSize).not.toBe('')
        await user.click(view.getByRole('button', { name: 'Toggle Sidebar' }))
        expect(gap.parentElement).toHaveAttribute(
          'data-collapsible',
          collapsible
        )
        // The primitive's width utilities must own collapsed sizing, without
        // an expanded inline-size overriding either icon or offcanvas width.
        expect(getComputedStyle(gap).inlineSize).toBe('auto')
        await user.click(view.getByRole('button', { name: 'Toggle Sidebar' }))
        expect(getComputedStyle(gap).inlineSize).toBe(expandedSize)
      }
    )
  }
)
