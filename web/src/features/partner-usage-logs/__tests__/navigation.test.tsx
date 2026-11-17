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
import { QueryClient } from '@tanstack/react-query'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { useSidebarView } from '@/hooks/use-sidebar-view'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import { useConsoleModeStore } from '@/stores/console-mode-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'
import { renderApp } from '@/test-utils/render-app'

let client: QueryClient
const originalMode = useConsoleModeStore.getState().mode

function NavigationProbe() {
  const { navGroups } = useSidebarView()
  return (
    <nav aria-label='Sidebar'>
      {navGroups.flatMap((group) =>
        group.items.map((item) =>
          item.url ? (
            <a key={`${group.id}:${item.title}`} href={item.url}>
              {item.title}
            </a>
          ) : null
        )
      )}
    </nav>
  )
}

function signIn(role: number) {
  const bundle = createTestAuthBundle()
  useAuthStore
    .getState()
    .auth.setBundle({ ...bundle, user: { ...bundle.user, role } })
}

beforeEach(() => {
  useConsoleModeStore.getState().setMode('developer')
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  })
  client.setQueryData(['status'], { enable_data_export: true })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.reset()
  useConsoleModeStore.getState().setMode(originalMode)
})

it('hides the merchant usage entry from ordinary users in both console modes', async () => {
  signIn(ROLE.USER)
  await renderApp(<NavigationProbe />, client)
  expect(
    screen.queryByRole('link', { name: 'Merchant usage logs' })
  ).not.toBeInTheDocument()
  cleanup()
  useConsoleModeStore.getState().setMode('easy')
  await renderApp(<NavigationProbe />, client)
  expect(
    screen.queryByRole('link', { name: 'Merchant usage logs' })
  ).not.toBeInTheDocument()
})

it.each([
  ['administrator', ROLE.ADMIN],
  ['root', ROLE.SUPER_ADMIN],
])('shows the merchant usage entry to %s', async (_name, role) => {
  signIn(role)
  await renderApp(<NavigationProbe />, client)
  expect(
    screen.getByRole('link', { name: 'Merchant usage logs' })
  ).toHaveAttribute('href', '/partner-usage-logs')
})
