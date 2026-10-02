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
import { KeysPage } from '@/pages/console/keys-page'

import type { KeyDetail } from '../keys-api'

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

export const ok = (data: unknown) => ({ data: { success: true, message: '', data } })
export const failed = (message: string) => ({ data: { success: false, message } })

export function apiKey(patch: Partial<KeyDetail> = {}): KeyDetail {
  return {
    id: 1,
    name: 'prod',
    key: 'abcd**********wxyz',
    status: 1,
    created_time: 1_760_000_000,
    accessed_time: 1_760_000_000,
    expired_time: -1,
    remain_quota: 500_000,
    unlimited_quota: false,
    used_quota: 250_000,
    group: 'vip',
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    cross_group_retry: false,
    auto_groups: null,
    ...patch,
  }
}

export const GROUPS = {
  auto: { desc: '自动选择可用分组', ratio: '自动' },
  default: { desc: '默认分组', ratio: 1 },
  vip: { desc: '高速通道', ratio: 0.5 },
}

type Config = { params?: unknown }
export type Responder = (url: string, config?: Config) => unknown

/** Answers GETs from a URL → data table; `override` may answer first (return undefined to fall through). */
export function serveGets(data: Record<string, unknown>, override?: Responder) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: Config) => {
    const answer = override?.(url, config)
    if (answer !== undefined) return answer
    return ok(data[url] ?? {})
  })
}

export function signIn() {
  authStore.applyBundle({
    user: USER,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

/** Narrow screens get cards; jsdom has no matchMedia, so tests opt in. */
export function usePhoneWidth() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

export function resetWidth() {
  Reflect.deleteProperty(window, 'matchMedia')
}

export function renderKeysPage() {
  const router = createMemoryRouter([{ path: '*', element: <KeysPage /> }], { initialEntries: ['/settings/keys'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
}
