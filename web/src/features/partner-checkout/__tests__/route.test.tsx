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
import { Route as RootRoute } from '@/routes/__root'
import { Route as CheckoutRoute } from '@/routes/partner/checkout'

import { forgetCashierAccess, prepareCashierEntry } from '../lib/access'
import { ORDER_NO, TOKEN, order, response } from './fixtures'

const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
  forgetCashierAccess(ORDER_NO)
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('cashier root isolation', () => {
  it('loads through the real root boundary with no login bootstrap/setup/status/reward requests or secret router history', async () => {
    const genericRequest = vi
      .fn()
      .mockRejectedValue(new Error('Generic API must not be called'))
    api.defaults.adapter = genericRequest
    const fetcher = vi.fn().mockImplementation(async () =>
      response({
        ...order,
        created_at: Math.floor(Date.now() / 1000) - 5,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      })
    )
    vi.stubGlobal('fetch', fetcher)
    window.history.replaceState(
      null,
      '',
      `/partner/checkout?order_no=${ORDER_NO}#token=${TOKEN}`
    )
    // Same startup ordering as main.tsx: scrub before constructing router history.
    prepareCashierEntry()
    const client = new QueryClient()
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
      component: RootRoute.options.component,
      beforeLoad: (context) => RootRoute.options.beforeLoad?.(context),
    })
    const checkout = createRoute({
      getParentRoute: () => root,
      path: '/partner/checkout',
      component: CheckoutRoute.options.component,
      validateSearch: CheckoutRoute.options.validateSearch,
    })
    const router = createRouter({
      routeTree: root.addChildren([checkout]),
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
    expect(
      await screen.findByRole('heading', { name: 'Subscription checkout' })
    ).toBeVisible()
    expect(
      await screen.findByRole('link', { name: 'Open secure payment page' })
    ).toBeVisible()
    expect(genericRequest).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(router.state.location.hash).toBe('')
    expect(JSON.stringify(router.state)).not.toContain(TOKEN)
    expect(screen.queryByRole('navigation')).toBeNull()
    view.unmount()
    client.clear()
  })
})
