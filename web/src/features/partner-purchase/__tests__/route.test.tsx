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
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import * as authSession from '@/lib/auth-session'
import { Route as RootRoute } from '@/routes/__root'
import { Route as PurchaseRoute } from '@/routes/partner/purchase'

import { forgetPurchaseEntry, preparePurchaseEntry } from '../lib/access'
import {
  ACCESS,
  aliases,
  catalog,
  LAUNCH,
  negatives,
  response,
  SESSION_ID,
} from './fixtures'

const originalAdapter = api.defaults.adapter
afterEach(() => {
  api.defaults.adapter = originalAdapter
  forgetPurchaseEntry(SESSION_ID)
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('real hosted purchase root boundary', () => {
  it.each(aliases)(
    'isolates %s from platform login/setup/status/rewards effects',
    async (pathname) => {
      const generic = vi
        .fn()
        .mockRejectedValue(new Error('No platform requests allowed'))
      api.defaults.adapter = generic
      const auth = vi.spyOn(authSession, 'bootstrapAuthentication')
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response({
            session_id: SESSION_ID,
            expires_at: Math.floor(Date.now() / 1000) + 300,
            access_token: ACCESS,
          })
        )
        .mockResolvedValueOnce(response(catalog()))
      vi.stubGlobal('fetch', fetcher)
      window.history.replaceState(
        null,
        '',
        `${pathname}?session_id=${SESSION_ID}#launch=${LAUNCH}`
      )
      preparePurchaseEntry()
      const client = new QueryClient()
      const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
        component: RootRoute.options.component,
        beforeLoad: (context) => RootRoute.options.beforeLoad?.(context),
      })
      const purchase = createRoute({
        getParentRoute: () => root,
        path: '/partner/purchase',
        component: PurchaseRoute.options.component,
        beforeLoad: PurchaseRoute.options.beforeLoad,
        validateSearch: PurchaseRoute.options.validateSearch,
      })
      const router = createRouter({
        routeTree: root.addChildren([purchase]),
        context: { queryClient: client },
        history: createMemoryHistory({
          initialEntries: [window.location.pathname + window.location.search],
        }),
      })
      await act(() => router.load())
      const view = render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
      expect(await screen.findByRole('radio', { name: 'Alipay' })).toBeVisible()
      expect(
        screen.getByRole('heading', { name: 'Choose your subscription' })
      ).toBeVisible()
      expect(generic).not.toHaveBeenCalled()
      expect(auth).not.toHaveBeenCalled()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(router.state)).not.toContain(LAUNCH)
      expect(JSON.stringify(router.state)).not.toContain(ACCESS)
      expect(screen.queryByRole('navigation')).toBeNull()
      view.unmount()
      client.clear()
    }
  )
  it.each(negatives)(
    'retains actual ordinary root auth/setup control flow for %s',
    async (pathname) => {
      const auth = vi
        .spyOn(authSession, 'bootstrapAuthentication')
        .mockResolvedValue({ kind: 'anonymous' })
      api.defaults.adapter = vi.fn().mockResolvedValue({
        data: { success: true, data: { status: true } },
        status: 200,
        headers: {},
        config: {},
      })
      const client = new QueryClient()
      const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
        beforeLoad: (context) => RootRoute.options.beforeLoad?.(context),
      })
      const ordinary = createRoute({
        getParentRoute: () => root,
        path: '$',
        component: () => null,
      })
      const router = createRouter({
        routeTree: root.addChildren([ordinary]),
        context: { queryClient: client },
        history: createMemoryHistory({ initialEntries: [pathname] }),
      })
      await router.load()
      client.clear()
      expect(auth).toHaveBeenCalledTimes(1)
    }
  )
})
