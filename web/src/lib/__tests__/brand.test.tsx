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

import { useBrand, useBrandTab } from '../queries'

function wrapper(props: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

beforeEach(() => {
  // The live site's system name; the brand shown must not depend on it.
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: { system_name: '野菜API', logo: '' } } })
})

afterEach(() => {
  vi.restoreAllMocks()
  setLang('zh')
})

describe('useBrand', () => {
  it('is 野菜 in Chinese and yeschoy in every other language, whatever the system name says', async () => {
    const { result } = renderHook(() => useBrand(), { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(result.current.name).toBe('野菜')

    await act(() => setLang('zh-TW'))
    expect(result.current.name).toBe('野菜')
    await act(() => setLang('en'))
    expect(result.current.name).toBe('yeschoy')
    await act(() => setLang('ja'))
    expect(result.current.name).toBe('yeschoy')
  })
})

describe('useBrandTab', () => {
  it('names the browser tab after the brand, in the current language', async () => {
    renderHook(() => useBrandTab(), { wrapper })
    expect(document.title).toBe('野菜')

    await act(() => setLang('en'))
    expect(document.title).toBe('yeschoy')
  })

  it('shows the operator’s logo as the tab icon when one is set', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: { logo: 'https://cdn.example.com/logo.png' } } })
    renderHook(() => useBrandTab(), { wrapper })
    await waitFor(() => expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('https://cdn.example.com/logo.png'))
  })
})
