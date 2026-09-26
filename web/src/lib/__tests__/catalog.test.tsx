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

const PRICING = {
  success: true,
  data: [
    { model_name: 'named', vendor_id: 1, quota_type: 0, model_ratio: 1, completion_ratio: 1 },
    { model_name: 'orphan', quota_type: 0, model_ratio: 1, completion_ratio: 1 },
  ],
  vendors: [{ id: 1, name: 'DeepSeek' }],
}

afterEach(() => {
  vi.restoreAllMocks()
  setLang('zh')
  window.localStorage.clear()
})

describe('useCatalog', () => {
  it('files models without a vendor under 其他, in the current language', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: PRICING })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useCatalog(), {
      wrapper: (props: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
      ),
    })
    await waitFor(() => expect(result.current.models).toHaveLength(2))
    expect(result.current.models.map((model) => model.vendor)).toEqual(['DeepSeek', '其他'])

    act(() => {
      setLang('en')
    })
    expect(result.current.models[1].vendor).toBe('Other')
  })
})
