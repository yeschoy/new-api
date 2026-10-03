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
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AxiosRequestConfig } from 'axios'
import { useState } from 'react'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { useGuideEnvironment } from '../use-guide-environment'

const MODEL = { quota_type: 0, model_ratio: 1, completion_ratio: 1 }
const PRICING = {
  success: true,
  data: [
    { ...MODEL, id: 1, model_name: 'chat-model', enable_groups: ['vip'], supported_endpoint_types: ['openai'] },
    { ...MODEL, id: 2, model_name: 'responses-model', enable_groups: ['default'], supported_endpoint_types: ['openai-response'], context_length: 1_000_000 },
    { ...MODEL, id: 3, model_name: 'responses-model-2', enable_groups: ['vip'], supported_endpoint_types: ['openai-response'] },
  ],
  vendors: [],
  group_ratio: { default: 1, vip: 2 },
  usable_group: { default: 'Standard', vip: 'VIP' },
}
const GROUPS = { default: { desc: 'Standard', ratio: 1 }, vip: { desc: 'VIP', ratio: 2 } }
const GROUP_MODELS: Record<string, string[]> = { default: ['responses-model'], vip: ['chat-model', 'responses-model-2'] }

let accountModels = ['chat-model', 'responses-model-2', 'responses-model']
let pricingFails = false

function mockServer() {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: AxiosRequestConfig) => {
    if (url === '/api/pricing') {
      if (pricingFails) throw new Error('offline')
      return { data: PRICING }
    }
    if (url === '/api/user/self/groups') return { data: { success: true, data: GROUPS } }
    if (url === '/api/user/models') {
      const group = (config?.params as { group?: string } | undefined)?.group
      return { data: { success: true, data: group ? GROUP_MODELS[group] : accountModels } }
    }
    return { data: { success: true, data: {} } }
  })
}

function wrapper(props: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

beforeEach(() => {
  accountModels = ['chat-model', 'responses-model-2', 'responses-model']
  pricingFails = false
  authStore.applyBundle({
    user: { id: 7, username: 'alice', role: 1 },
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  authStore.clear()
})

describe('useGuideEnvironment', () => {
  it('offers only the account models and groups that fit the article protocol', async () => {
    mockServer()
    const { result } = renderHook(() => useGuideEnvironment('openai-response', {}, vi.fn()), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.models).toEqual(['responses-model', 'responses-model-2'])
    expect(result.current.groups).toEqual([{ value: 'default', label: 'Standard' }])
    expect(result.current).toMatchObject({ model: 'responses-model', group: 'default', contextLength: 1_000_000 })
  })

  it('replaces a model or group the account cannot use with the first one that fits', async () => {
    mockServer()
    const { result } = renderHook(() => useGuideEnvironment('openai-response', { model: 'missing', group: 'vip' }, vi.fn()), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ model: 'responses-model', group: 'default' })
  })

  it('moves to a group that has the newly chosen model', async () => {
    mockServer()
    const { result } = renderHook(
      () => {
        const [requested, setRequested] = useState({ model: 'responses-model', group: 'default' })
        return useGuideEnvironment('openai-response', requested, setRequested)
      },
      { wrapper }
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.setModel('responses-model-2'))

    await waitFor(() => expect(result.current).toMatchObject({ model: 'responses-model-2', group: 'vip' }))
  })

  it('reports that nothing fits when no account model speaks the protocol', async () => {
    accountModels = ['chat-model']
    mockServer()
    const { result } = renderHook(() => useGuideEnvironment('anthropic', {}, vi.fn()), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('empty'))
    expect(result.current.models).toEqual([])
  })

  it('reports an error and keeps placeholders when the catalog cannot load', async () => {
    pricingFails = true
    mockServer()
    const { result } = renderHook(() => useGuideEnvironment('all', {}, vi.fn()), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ model: '<model>', group: '<group>' })
  })

  it('asks nothing about the account when the visitor is signed out', async () => {
    authStore.clear()
    const get = mockServer()
    const { result } = renderHook(() => useGuideEnvironment('all', {}, vi.fn()), { wrapper })

    expect(result.current).toMatchObject({ status: 'signed-out', model: '<model>', group: '<group>' })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/pricing'))
    expect(get.mock.calls.map((call) => call[0])).not.toContain('/api/user/models')
  })
})
