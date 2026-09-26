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

import { setLang } from '@/i18n/i18n'
import { api } from '@/lib/api'

import { useCatalog } from '../queries'

const price = { quota_type: 0, model_ratio: 1, completion_ratio: 1 }

/** useCatalog over a stubbed /api/pricing answer. */
async function catalogOf(pricing: object) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, ...pricing } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const hook = renderHook(() => useCatalog(), {
    wrapper: (props: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(hook.result.current.models.length).toBeGreaterThan(0))
  return hook.result
}

afterEach(() => {
  vi.restoreAllMocks()
  setLang('zh')
  window.localStorage.clear()
})

describe('useCatalog', () => {
  it('files models without a vendor under 其他, in the current language', async () => {
    const result = await catalogOf({
      data: [
        { model_name: 'named', vendor_id: 1, ...price },
        { model_name: 'orphan', ...price },
      ],
      vendors: [{ id: 1, name: 'DeepSeek' }],
    })
    expect(result.current.models.map((model) => model.vendor)).toEqual(['DeepSeek', '其他'])

    act(() => {
      setLang('en')
    })
    expect(result.current.models[1].vendor).toBe('Other')
  })

  it('gives models without an icon their family icon, keeping icons set in the admin', async () => {
    const result = await catalogOf({
      data: [
        { model_name: 'deepseek-v4', vendor_id: 1, ...price },
        { model_name: 'grok-4.7', vendor_id: 2, ...price },
        { model_name: 'seed-2.1-pro', ...price },
      ],
      vendors: [
        { id: 1, name: 'DeepSeek', icon: 'Custom.Icon' },
        { id: 2, name: 'xAI' },
      ],
    })
    expect(result.current.models.map((model) => model.vendorIcon)).toEqual(['Custom.Icon', 'Grok', 'Doubao.Color'])
  })
})
