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
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'

import { BeginnerGuidePage } from '../beginner-guide-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const MODEL = { quota_type: 0, model_ratio: 1, completion_ratio: 1, enable_groups: ['default'] }

function renderPage(path = '/beginner-guide') {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/status') return { data: { success: true, data: { server_address: 'https://api.example.test' } } }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          data: [
            { ...MODEL, id: 1, model_name: 'some-model' },
            { ...MODEL, id: 2, model_name: 'gpt-6-sol' },
          ],
          vendors: [],
          group_ratio: {},
          usable_group: {},
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  const router = createMemoryRouter([{ path: '/beginner-guide', element: <BeginnerGuidePage /> }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function toolList() {
  return screen.getByRole('region', { name: '选好工具，照步骤做' })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('beginner guide', () => {
  it('shows this site address, a masked key and a real model of this site', async () => {
    renderPage()
    expect(await screen.findByText('https://api.example.test/v1')).toBeInTheDocument()
    expect(screen.getByText('sk-****************')).toBeInTheDocument()
    expect(await screen.findByText('gpt-6-sol')).toBeInTheDocument()
  })

  it('copies the address from its card', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderPage()
    await screen.findByText('https://api.example.test/v1')

    await user.click(screen.getByRole('button', { name: '复制接口地址' }))

    expect(writeText).toHaveBeenCalledWith('https://api.example.test/v1')
  })

  it('opens a tool with its steps filled in with this site address', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('https://api.example.test/v1')

    await user.click(within(toolList()).getByRole('button', { name: /^Cherry Studio/ }))

    const dialog = screen.getByRole('dialog', { name: /Cherry Studio/ })
    expect(within(dialog).getByText('API 地址填 https://api.example.test/v1')).toBeInTheDocument()
  })

  it('opens the tool named in the link', () => {
    renderPage('/beginner-guide?tool=workbuddy')
    expect(screen.getByRole('dialog', { name: /WorkBuddy \/ CodeBuddy/ })).toBeInTheDocument()
  })

  it('keeps the tool list and opens nothing for an unknown tool in the link', () => {
    renderPage('/beginner-guide?tool=missing-tool')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(toolList()).getByRole('button', { name: /^WorkBuddy \/ CodeBuddy/ })).toBeInTheDocument()
  })

  it('narrows the tools to a use case and brings them all back on clear', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /终端里写代码/ }))
    expect(within(toolList()).queryByRole('button', { name: /^WorkBuddy \/ CodeBuddy/ })).toBeNull()
    expect(within(toolList()).getByRole('button', { name: /^Claude Code/ })).toBeInTheDocument()

    await user.click(within(toolList()).getByRole('button', { name: '清除筛选器' }))
    expect(within(toolList()).getByRole('button', { name: /^WorkBuddy \/ CodeBuddy/ })).toBeInTheDocument()
  })

  it('shows one category at a time', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: '翻译与阅读' }))

    expect(within(toolList()).getByRole('button', { name: /^沉浸式翻译/ })).toBeInTheDocument()
    expect(within(toolList()).queryByRole('button', { name: /^Cherry Studio/ })).toBeNull()
  })

  it('filters the tools by the search in the link until it is cleared', async () => {
    const user = userEvent.setup()
    renderPage('/beginner-guide?q=cursor')
    expect(within(toolList()).getByRole('button', { name: /^Cursor/ })).toBeInTheDocument()
    expect(within(toolList()).queryByRole('button', { name: /^Cline/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: '清除搜索' }))

    expect(within(toolList()).getByRole('button', { name: /^Cline/ })).toBeInTheDocument()
  })

  it('explains an error and its fix when it is opened', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText('地址或路径拼错')).not.toBeVisible()

    await user.click(screen.getByText('404 Not Found'))

    expect(screen.getByText('地址或路径拼错')).toBeVisible()
    expect(screen.getByText('检查是否重复了 /v1 或 /chat/completions')).toBeVisible()
  })
})
