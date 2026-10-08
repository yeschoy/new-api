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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { Toaster } from '@/components/ui'
import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

/** A signed-in account page with the API answering from `responses` by URL. */
export const USER = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  email: 'alice@example.com',
  quota: 5_000_000,
  used_quota: 1_000_000,
  request_count: 42,
  group: 'default',
}

export const SESSION = { sid: 'sid-here', current: true, login_method: 'password', expires_at: 9_999_999_999 }

export const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

export function signIn(user: Record<string, unknown> = USER) {
  authStore.applyBundle({
    user: user as typeof USER,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: SESSION,
  })
}

export function renderAccountPage(element: React.ReactNode, responses: Record<string, unknown>) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(url in responses ? responses[url] : {}))
  const router = createMemoryRouter(
    [
      { path: '/settings/security', element },
      { path: '/settings/profile', element },
      { path: '/sign-in', element: <p>sign-in page</p> },
    ],
    { initialEntries: ['/settings/security'] }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
  return get
}
