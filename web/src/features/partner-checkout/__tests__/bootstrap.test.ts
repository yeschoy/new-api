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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ORDER_NO, TOKEN } from './fixtures'

const observers = vi.hoisted(() => ({
  initializeFrontendCache: vi.fn(),
  readCachedStatus: vi.fn(),
  ensureQueryData: vi.fn(async () => ({})),
  createRouter: vi.fn(() => ({ navigate: vi.fn() })),
}))

vi.mock('@/lib/frontend-cache', () => ({
  initializeFrontendCache: observers.initializeFrontendCache,
}))
vi.mock('@/lib/status-query', () => ({
  readCachedStatus: observers.readCachedStatus,
  statusQueryOptions: {},
}))
vi.mock('@/lib/query-client', () => ({
  createAppQueryClient: () => ({ ensureQueryData: observers.ensureQueryData }),
}))
vi.mock('@tanstack/react-router', () => ({
  createRouter: observers.createRouter,
  RouterProvider: () => null,
}))
vi.mock('@/routeTree.gen', () => ({ routeTree: {} }))
vi.mock('@/i18n/config', () => ({}))
vi.mock('@/lib/build-metadata', () => ({ installBuildMetadata: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="root">already rendered</div>'
})

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
})

describe('cashier main bootstrap isolation', () => {
  it.each([
    '/partner/checkout',
    '/partner/checkout/',
    '/partner/%63heckout',
    '/%70artner/checkout',
    '/partner%2Fcheckout',
    '/partner/%63heckout%2f',
  ])(
    'scrubs %s before main creates its router and never primes branding/status/cache',
    async (pathname) => {
      window.history.replaceState(
        null,
        '',
        `${pathname}?order_no=${ORDER_NO}#token=${TOKEN}`
      )
      observers.createRouter.mockImplementationOnce(() => {
        expect(window.location.pathname).toBe('/partner/checkout')
        expect(window.location.hash).toBe('')
        expect(window.location.search).toBe(`?order_no=${ORDER_NO}`)
        return { navigate: vi.fn() }
      })
      await import('@/main')
      expect(observers.createRouter).toHaveBeenCalledTimes(1)
      expect(observers.initializeFrontendCache).not.toHaveBeenCalled()
      expect(observers.readCachedStatus).not.toHaveBeenCalled()
      expect(observers.ensureQueryData).not.toHaveBeenCalled()
      expect(
        JSON.parse(
          sessionStorage.getItem(`partner-checkout:v1:${ORDER_NO}`) || '{}'
        ).token
      ).toBe(TOKEN)
    }
  )

  it('keeps ordinary-page cache and branding/status initialization', async () => {
    window.history.replaceState(null, '', '/')
    await import('@/main')
    expect(observers.initializeFrontendCache).toHaveBeenCalledTimes(1)
    expect(observers.readCachedStatus).toHaveBeenCalledTimes(1)
    expect(observers.ensureQueryData).toHaveBeenCalledTimes(1)
  })
  it.each([
    '/partner/purchase',
    '/partner/purchase/',
    '/partner/%70urchase',
    '/%70artner/purchase',
    '/partner%2Fpurchase',
    '/partner/%70urchase%2f',
  ])(
    'scrubs hosted purchase %s before router without cache/status/branding',
    async (pathname) => {
      const sessionId = `PPS${'s'.repeat(32)}`
      const launch = `pl_${'a'.repeat(64)}`
      window.history.replaceState(
        null,
        '',
        `${pathname}?session_id=${sessionId}#launch=${launch}`
      )
      observers.createRouter.mockImplementationOnce(() => {
        expect(window.location.pathname).toBe('/partner/purchase')
        expect(window.location.hash).toBe('')
        return { navigate: vi.fn() }
      })
      await import('@/main')
      expect(observers.createRouter).toHaveBeenCalledTimes(1)
      expect(observers.initializeFrontendCache).not.toHaveBeenCalled()
      expect(observers.readCachedStatus).not.toHaveBeenCalled()
      expect(observers.ensureQueryData).not.toHaveBeenCalled()
      const staged = JSON.parse(
        sessionStorage.getItem(`partner-purchase:v1:${sessionId}`) || '{}'
      )
      expect(staged.launchCode).toBe(launch)
      expect(staged.nonce).toMatch(/^[a-f0-9]{64}$/)
    }
  )

  it.each([
    '/partner/%2570urchase',
    '/partner/purchase-other',
    '/partner/%',
    '/partner/%FFpurchase',
    '/partner/purchase/child',
    '/partner/%2563heckout',
    '/partner/checkout-other',
    '/sign-in',
  ])('keeps ordinary bootstrap for negative path %s', async (pathname) => {
    window.history.replaceState(null, '', pathname)
    await import('@/main')
    expect(observers.initializeFrontendCache).toHaveBeenCalledTimes(1)
    expect(observers.readCachedStatus).toHaveBeenCalledTimes(1)
    expect(observers.ensureQueryData).toHaveBeenCalledTimes(1)
  })
})
