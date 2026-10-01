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
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useConsoleModeStore } from '@/stores/console-mode-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'
import { renderApp } from '@/test-utils/render-app'

import { SubscriptionPlansCard } from '../components/subscription-plans-card'
import { useRedemption } from '../hooks/use-redemption'
import { Wallet } from '../index'

const originalAdapter = api.defaults.adapter
const originalMode = useConsoleModeStore.getState().mode
let client: QueryClient
let redemptionEnabled = true

beforeEach(() => {
  redemptionEnabled = true
  useConsoleModeStore.getState().setMode('easy')
  const bundle = createTestAuthBundle()
  useAuthStore.getState().auth.setBundle({
    ...bundle,
    user: {
      ...bundle.user,
      quota: 1000,
      used_quota: 500,
      request_count: 1,
      aff_quota: 0,
      aff_history_quota: 0,
      aff_count: 0,
      group: 'default',
    },
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
  api.defaults.adapter = async (config) => {
    const url = new URL(config.url ?? '', 'http://localhost')
    let data: unknown
    if (url.pathname === '/api/user/self') {
      data = {
        success: true,
        data: {
          id: 12,
          username: 'test-user',
          quota: 1000,
          used_quota: 500,
          request_count: 1,
          aff_quota: 0,
          aff_history_quota: 0,
          aff_count: 0,
          group: 'default',
        },
      }
    } else if (url.pathname === '/api/user/topup/info') {
      data = {
        success: true,
        data: {
          enable_online_topup: false,
          enable_stripe_topup: false,
          pay_methods: [],
          min_topup: 1,
          stripe_min_topup: 1,
          amount_options: [],
          discount: {},
          enable_redemption: redemptionEnabled,
          payment_compliance_confirmed: redemptionEnabled,
        },
      }
    } else if (url.pathname === '/api/user/aff') {
      data = { success: true, data: '' }
    } else if (url.pathname === '/api/log/self/summary') {
      data = {
        success: true,
        data: {
          requests: 0,
          succeeded: 0,
          failed: 0,
          quota: 0,
          tokens: 0,
          saved_quota: 0,
          comparable_requests: 0,
          daily: [],
        },
      }
    } else if (url.pathname === '/api/user/amount') {
      data = { success: true, data: '0' }
    } else if (url.pathname === '/api/user/topup/self') {
      data = {
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 10 },
      }
    } else {
      throw new Error(`Unexpected request: ${config.method} ${url.pathname}`)
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
  useConsoleModeStore.getState().setMode(originalMode)
})

describe('easy wallet redemption', () => {
  it('renders exactly one redemption action when redemption is enabled', async () => {
    await renderApp(<Wallet />, client)

    await screen.findByText('Have a Code?')
    expect(screen.getAllByRole('button', { name: 'Redeem' })).toHaveLength(1)
  })

  it.each([
    {
      data: 500,
      expected: 'Redemption successful! Added:',
      refreshFails: false,
    },
    {
      data: { type: 'subscription', plan_id: 7, plan_title: 'Pro' },
      expected: 'Subscription redeemed: Pro',
      refreshFails: false,
    },
    {
      data: { type: 'subscription', plan_id: 7, plan_title: 'Pro' },
      expected: 'Subscription redeemed: Pro',
      refreshFails: true,
    },
  ])(
    'reports the correct entitlement after redeeming $data',
    async ({ data, expected, refreshFails }) => {
      const adapter = api.defaults.adapter
      api.defaults.adapter = async (config) => {
        if (config.url === '/api/user/topup') {
          return {
            data: { success: true, data },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          }
        }
        if (refreshFails && config.url === '/api/user/self') {
          throw new Error('refresh unavailable')
        }
        if (typeof adapter === 'function') return adapter(config)
        throw new Error('Missing adapter')
      }
      render(<Toaster />)
      const { result } = renderHook(() => useRedemption())
      await act(async () => {
        expect(await result.current.redeemCode('gift')).toBe(true)
      })
      expect(
        await screen.findByText((content) => content.includes(expected))
      ).toBeVisible()
    }
  )

  it('shows the current scope of an active subscription even if its plan is no longer for sale', async () => {
    const adapter = api.defaults.adapter
    api.defaults.adapter = async (config) => {
      const path = new URL(config.url ?? '', 'http://localhost').pathname
      if (path === '/api/subscription/plans') {
        return {
          data: { success: true, data: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      if (path === '/api/subscription/self') {
        return {
          data: {
            success: true,
            data: {
              billing_preference: 'subscription_first',
              subscriptions: [
                {
                  applicable_group: 'deepflash',
                  subscription: {
                    id: 17,
                    plan_id: 8,
                    status: 'active',
                    end_time: Date.now() / 1000 + 3600,
                    amount_total: 500000,
                    amount_used: 0,
                  },
                },
              ],
              all_subscriptions: [
                {
                  applicable_group: 'deepflash',
                  subscription: {
                    id: 17,
                    plan_id: 8,
                    status: 'active',
                    end_time: Date.now() / 1000 + 3600,
                    amount_total: 500000,
                    amount_used: 0,
                  },
                },
              ],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      if (typeof adapter === 'function') return adapter(config)
      throw new Error('Missing adapter')
    }

    await renderApp(<SubscriptionPlansCard topupInfo={null} />, client)

    expect(await screen.findByText(/Applicable Group/)).toBeVisible()
    expect(screen.getByText('deepflash')).toBeVisible()
  })

  it('hides the redemption action when compliance disables redemption', async () => {
    redemptionEnabled = false

    await renderApp(<Wallet />, client)

    await screen.findByText(
      'Redemption codes are disabled until the administrator confirms compliance terms.'
    )
    expect(screen.queryByRole('button', { name: 'Redeem' })).toBeNull()
  })
})
