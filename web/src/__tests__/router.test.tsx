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
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'

import { routes } from '../router'

// The real shell pulls in the icon library (not loadable under jsdom).
vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const UNINITIALISED = { status: false, root_init: false, database_type: 'sqlite' }

beforeEach(() => {
  // jsdom has no scrolling; the layout scrolls to the top on navigation.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('app routes', () => {
  it('shows no setup notice or setup link on an uninitialised instance', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
      data: { success: true, message: '', data: url === '/api/setup' ? UNINITIALISED : {} },
    }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['setup'], UNINITIALISED)
    const router = createMemoryRouter(routes, { initialEntries: ['/missing-page'] })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('页面不存在')).toBeInTheDocument()
    expect(screen.queryAllByText(/初始化/)).toHaveLength(0)
    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).not.toContain('/setup')
  })
})
