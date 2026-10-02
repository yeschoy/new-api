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
import { authStore, type AuthUser } from '@/lib/auth-store'

/** A signed-in user with 10 USD of balance (quota_per_unit 500 000). */
export const USER: AuthUser & Record<string, unknown> = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  quota: 5_000_000,
  used_quota: 1_000_000,
  request_count: 42,
  group: 'default',
  aff_code: 'AB12',
  aff_count: 3,
  aff_quota: 1_500_000,
  aff_history_quota: 2_500_000,
}

export const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

/** Answers GETs from a table by path; anything else is an empty success. */
export function answerGets(responses: Record<string, unknown>) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(responses[url] ?? {}))
}

export function signIn(user: AuthUser = USER) {
  authStore.applyBundle({
    user,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

export function renderPage(element: React.ReactNode, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
}
