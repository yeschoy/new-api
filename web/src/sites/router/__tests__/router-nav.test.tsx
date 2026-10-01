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
import { cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { ThemeProvider } from '@/site/theme'

import { RouterFooter } from '../router-footer'
import { RouterHeader } from '../router-header'

vi.mock('@/components/provider-icon', () => ({
  ProviderIcon: () => <span aria-hidden='true' />,
}))

// The live site's switches on 2026-10-01: rankings and about are off.
const STATUS = {
  docs_link: 'https://docs.example.com',
  HeaderNavModules: JSON.stringify({
    home: true,
    console: true,
    pricing: { enabled: true, requireAuth: false },
    rankings: { enabled: false, requireAuth: true },
    docs: true,
    about: false,
  }),
}

function renderNav() {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: { success: true, data: url === '/api/status' ? STATUS : [] },
  }))
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <RouterHeader />
            <RouterFooter />
          </>
        ),
      },
    ],
    { initialEntries: ['/'] }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('navigation', () => {
  it('leaves out the sections the admin switched off', async () => {
    renderNav()
    const header = screen.getByRole('navigation')
    expect(await within(header).findByRole('link', { name: '文档' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: '定价' })).toBeInTheDocument()
    expect(within(header).queryByRole('link', { name: '排行榜' })).toBeNull()

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: '定价' })).toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: '排行榜' })).toBeNull()
    expect(within(footer).queryByRole('link', { name: '关于' })).toBeNull()
  })
})
