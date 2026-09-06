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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { AxiosError } from 'axios'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { usePricingData } from '../use-pricing-data'

const initialAuth = useAuthStore.getState().auth
const originalAdapter = api.defaults.adapter
let client: QueryClient
let requests: string[]
let access: { enabled: boolean; requireAuth: boolean }
let statusFails: boolean
let pricingDenied: boolean

function Wrapper(props: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  requests = []
  access = { enabled: true, requireAuth: false }
  statusFails = false
  pricingDenied = false
  localStorage.clear()
  useAuthStore.setState({
    auth: { ...initialAuth, user: null, accessToken: null },
  })
  api.defaults.adapter = vi.fn(async (config) => {
    requests.push(config.url ?? '')
    if (
      (statusFails && config.url === '/api/status') ||
      (pricingDenied && config.url === '/api/pricing')
    ) {
      throw new AxiosError('denied', 'ERR_BAD_REQUEST', config, undefined, {
        config,
        status: pricingDenied ? 401 : 503,
        statusText: 'denied',
        headers: {},
        data: {},
      })
    }
    const data =
      config.url === '/api/status'
        ? {
            success: true,
            data: { HeaderNavModules: JSON.stringify({ pricing: access }) },
          }
        : {
            success: true,
            data: [
              {
                id: 1,
                model_name: 'gpt-test',
                quota_type: 0,
                model_ratio: 1,
                completion_ratio: 2,
              },
            ],
            vendors: [],
            group_ratio: {},
          }
    return { config, status: 200, statusText: 'OK', headers: {}, data }
  })
})

afterEach(async () => {
  cleanup()
  await client.cancelQueries()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.setState({ auth: initialAuth })
  localStorage.clear()
})

describe('home pricing preview access', () => {
  it.each(['login required', 'disabled', 'status unavailable'])(
    'does not request pricing when %s, even with a public cached status',
    async (scenario) => {
      access = {
        enabled: scenario !== 'disabled',
        requireAuth: scenario === 'login required',
      }
      statusFails = scenario === 'status unavailable'
      localStorage.setItem(
        'status',
        JSON.stringify({ HeaderNavModules: '{"pricing":true}' })
      )
      const { result } = renderHook(
        () => usePricingData(true, { publicPreview: true }),
        { wrapper: Wrapper }
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.models).toEqual([])
      expect(requests).not.toContain('/api/pricing')
    }
  )

  it.each([false, true])(
    'loads permitted pricing with authenticated=%s',
    async (authenticated) => {
      access.requireAuth = authenticated
      if (authenticated) {
        useAuthStore.setState({
          auth: {
            ...initialAuth,
            user: { id: 1, username: 'test', role: 1 },
            accessToken: 'test-token',
          },
        })
      }
      const { result } = renderHook(
        () => usePricingData(true, { publicPreview: true }),
        { wrapper: Wrapper }
      )
      await waitFor(() =>
        expect(result.current.models[0]?.model_name).toBe('gpt-test')
      )
    }
  )

  it('removes protected preview data after signing out', async () => {
    access.requireAuth = true
    useAuthStore.setState({
      auth: {
        ...initialAuth,
        user: { id: 1, username: 'test', role: 1 },
        accessToken: 'test-token',
      },
    })
    const { result } = renderHook(
      () => usePricingData(true, { publicPreview: true }),
      { wrapper: Wrapper }
    )
    await waitFor(() => expect(result.current.models).toHaveLength(1))
    act(() =>
      useAuthStore.setState({
        auth: { ...initialAuth, user: null, accessToken: null },
      })
    )
    await waitFor(() => expect(result.current.models).toEqual([]))
  })

  it('does not rotate the session if pricing becomes protected after the access check', async () => {
    pricingDenied = true
    const refresh = vi.spyOn(
      await import('@/lib/auth-session'),
      'refreshAuthentication'
    )
    const { result } = renderHook(
      () => usePricingData(true, { publicPreview: true }),
      { wrapper: Wrapper }
    )
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
    expect(result.current.models).toEqual([])
  })
})
