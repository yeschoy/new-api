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
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CashbackPublicOffers } from '@/features/cashback/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'

import { REWARD_BANNER_DISMISS_KEY, RewardBanner } from '..'

const originalAdapter = api.defaults.adapter
let client: QueryClient

const firstTopUpOffers: CashbackPublicOffers = {
  active: true,
  currency: 'CNY',
  invitee: {
    strategy: 'tiered',
    tiers: [{ threshold_cents: 10_000, reward_cents: 500 }],
    payer_scope: 'first_top_up',
  },
}

function serveOffers(respond: () => { status: number; data: unknown }) {
  const adapter: AxiosAdapter = async (config) => {
    const reply = respond()
    return { config, statusText: 'OK', headers: {}, ...reply }
  }
  api.defaults.adapter = adapter
}

function offersReply(offers: CashbackPublicOffers) {
  return { status: 200, data: { success: true, data: offers } }
}

async function renderAt(path: string, status: Record<string, unknown> = {}) {
  client.setQueryData(
    ['status'],
    { register_enabled: true, quota_for_new_user: 0, ...status },
    { updatedAt: Date.now() + 60_000 }
  )
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <RewardBanner />
        <Outlet />
      </QueryClientProvider>
    ),
  })
  const routeTree = root.addChildren(
    ['/', '/setup', '/oauth/$provider', '/404', '/wallet', '/sign-up'].map(
      (routePath) =>
        createRoute({
          getParentRoute: () => root,
          path: routePath,
          component: () => <main>page</main>,
        })
    )
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await act(async () => {
    await router.load()
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T12:00:00+08:00'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  window.localStorage.removeItem(REWARD_BANNER_DISMISS_KEY)
})

afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
  window.localStorage.removeItem(REWARD_BANNER_DISMISS_KEY)
  document.documentElement.style.removeProperty('--reward-banner-height')
  vi.useRealTimers()
})

describe('RewardBanner', () => {
  it.each(['/', '/wallet'])(
    'labels a live payer reward as Double Eleven on %s without changing its amount or action',
    async (path) => {
      serveOffers(() =>
        offersReply({
          active: true,
          currency: 'CNY',
          invitee: { strategy: 'per_hundred', fixed_per_hundred: 10 },
        })
      )
      await renderAt(path)
      expect(await screen.findByText('Double 11 special')).toBeVisible()
      expect(
        screen.getByRole('region', { name: 'Announcements' })
      ).toHaveTextContent('Top-up: ¥10 for every ¥100')
      expect(screen.getByRole('link', { name: /Top up now/ })).toHaveAttribute(
        'href',
        '/sign-up'
      )
    }
  )

  it.each(['2026-11-09T23:59:59+08:00', '2026-11-19T00:00:00+08:00'])(
    'keeps regular recharge copy outside the Double Eleven display window: %s',
    async (date) => {
      vi.setSystemTime(new Date(date))
      serveOffers(() => offersReply(firstTopUpOffers))
      await renderAt('/')
      await screen.findByRole('link', { name: /Top up now/ })
      expect(screen.queryByText('Double 11 special')).toBeNull()
      expect(
        screen.getByRole('region', { name: 'Announcements' })
      ).toHaveTextContent('First top-up ¥100 get ¥5')
    }
  )

  it('removes only the special label at the deadline without reloading', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-18T23:59:59+08:00'))
    client.setQueryData(['cashback', 'public-offers'], firstTopUpOffers)
    serveOffers(() => offersReply(firstTopUpOffers))
    await renderAt('/')
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Double 11 special')).toBeVisible()
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.queryByText('Double 11 special')).toBeNull()
    expect(
      screen.getByRole('region', { name: 'Announcements' })
    ).toHaveTextContent('First top-up ¥100 get ¥5')
  })

  it('does not label a sign-up-only grant as Double Eleven', async () => {
    serveOffers(() => offersReply({ active: false, currency: 'CNY' }))
    await renderAt('/', { quota_for_new_user: 500_000 })
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Announcements' })
      ).toHaveTextContent(/New users get/)
    )
    expect(screen.queryByText('Double 11 special')).toBeNull()
  })

  it('removes the special label if the payer campaign stops', async () => {
    let offers = firstTopUpOffers
    serveOffers(() => offersReply(offers))
    await renderAt('/wallet')
    expect(await screen.findByText('Double 11 special')).toBeVisible()
    offers = { active: false, currency: 'CNY' }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['cashback', 'public-offers'] })
    })
    await waitFor(() =>
      expect(screen.queryByText('Double 11 special')).toBeNull()
    )
    expect(
      screen.getByRole('region', { name: 'Announcements' })
    ).toHaveTextContent('Fastrun Cloud Hackathon')
  })

  it('sends anonymous visitors to sign-up from a live first-top-up offer', async () => {
    serveOffers(() => offersReply(firstTopUpOffers))
    await renderAt('/')

    const banner = await screen.findByRole('region', {
      name: 'Announcements',
    })
    await waitFor(() =>
      expect(banner).toHaveTextContent('First top-up ¥100 get ¥5')
    )
    expect(screen.getByRole('link', { name: /Top up now/ })).toHaveAttribute(
      'href',
      '/sign-up'
    )
    expect(banner).not.toHaveTextContent('Fastrun Cloud Hackathon')
    expect(
      screen.queryByRole('link', { name: /Explore the hackathon/ })
    ).toBeNull()
  })

  it('sends signed-in users to the wallet', async () => {
    useAuthStore.getState().auth.setBundle(createTestAuthBundle())
    serveOffers(() => offersReply(firstTopUpOffers))
    await renderAt('/')

    expect(
      await screen.findByRole('link', { name: /Top up now/ })
    ).toHaveAttribute('href', '/wallet')
  })

  it('keeps only the hackathon on other pages when the offers request fails even with a sign-up grant', async () => {
    serveOffers(() => ({ status: 500, data: { success: false } }))
    await renderAt('/wallet', { quota_for_new_user: 500_000 })

    await waitFor(() =>
      expect(client.getQueryState(['cashback', 'public-offers'])?.status).toBe(
        'error'
      )
    )
    const banner = screen.getByRole('region', { name: 'Announcements' })
    expect(banner).toHaveTextContent('Fastrun Cloud Hackathon')
    expect(banner).not.toHaveTextContent(/New users get/)
    expect(screen.queryByRole('link', { name: /Top up now/ })).toBeNull()
  })

  it('does not put the hackathon back above the home hero when rewards cannot load', async () => {
    serveOffers(() => ({ status: 500, data: { success: false } }))
    await renderAt('/', { quota_for_new_user: 500_000 })
    await waitFor(() =>
      expect(client.getQueryState(['cashback', 'public-offers'])?.status).toBe(
        'error'
      )
    )
    expect(screen.queryByRole('region', { name: 'Announcements' })).toBeNull()
    expect(
      document.documentElement.style.getPropertyValue('--reward-banner-height')
    ).toBe('')
  })

  it('links the hackathon to the home spotlight beside the live offer', async () => {
    serveOffers(() => offersReply(firstTopUpOffers))
    await renderAt('/wallet')

    expect(
      await screen.findByRole('link', { name: /Top up now/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Explore the hackathon/ })
    ).toHaveAttribute('href', '/#hackathon')
  })

  it('shows only the sign-up grant when no campaign is live', async () => {
    serveOffers(() => offersReply({ active: false, currency: 'CNY' }))
    await renderAt('/', { quota_for_new_user: 500_000 })

    const banner = await screen.findByRole('region', {
      name: 'Announcements',
    })
    await waitFor(() =>
      expect(banner).toHaveTextContent(/New users get .+ on sign-up/)
    )
    expect(banner).not.toHaveTextContent('Top up ¥')
  })

  it.each(['/setup', '/oauth/github', '/404', '/missing-page'])(
    'is hidden on %s',
    async (path) => {
      serveOffers(() => offersReply(firstTopUpOffers))
      await renderAt(path)

      await waitFor(() =>
        expect(
          client.getQueryState(['cashback', 'public-offers'])?.status
        ).toBe('success')
      )
      expect(screen.queryByRole('region', { name: 'Announcements' })).toBeNull()
    }
  )

  it('stays dismissed for the same rules and returns when the rules change', async () => {
    let offers = firstTopUpOffers
    serveOffers(() => offersReply(offers))
    const view = await renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Announcements' })).toBeNull()

    view.unmount()
    client.clear()
    await renderAt('/')
    await waitFor(() =>
      expect(client.getQueryState(['cashback', 'public-offers'])?.status).toBe(
        'success'
      )
    )
    expect(screen.queryByRole('region', { name: 'Announcements' })).toBeNull()

    offers = {
      ...firstTopUpOffers,
      invitee: { strategy: 'rate', rate_bps: 500 },
    }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['cashback', 'public-offers'] })
    })
    expect(
      await screen.findByRole('region', { name: 'Announcements' })
    ).toHaveTextContent('Top-up: 5% back')
  })
})
