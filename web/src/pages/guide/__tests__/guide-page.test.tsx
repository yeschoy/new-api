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
import { authStore } from '@/lib/auth-store'

import { GuidePage } from '../guide-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const PRICING = {
  success: true,
  data: [
    {
      id: 1,
      model_name: 'responses-model',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      supported_endpoint_types: ['openai-response'],
      context_length: 1_000_000,
    },
  ],
  vendors: [],
  group_ratio: { default: 1 },
  usable_group: { default: 'Standard route' },
}

let accountModels = ['responses-model']

function mockServer() {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/status') return { data: { success: true, data: { server_address: 'https://api.example.test/' } } }
    if (url === '/api/pricing') return { data: PRICING }
    if (url === '/api/user/self/groups') return { data: { success: true, data: { default: { desc: 'Standard route', ratio: 1 } } } }
    if (url === '/api/user/models') return { data: { success: true, data: accountModels } }
    return { data: { success: true, data: {} } }
  })
}

function renderGuide(path: string) {
  mockServer()
  const router = createMemoryRouter(
    [
      { path: '/guide', element: <GuidePage /> },
      { path: '/guide/:slug', element: <GuidePage /> },
    ],
    { initialEntries: [path] }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountModels = ['responses-model']
  authStore.applyBundle({
    user: { id: 7, username: 'alice', role: 1 },
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('developer guide', () => {
  it('lists every article in the sidebar, the quick start at /guide', () => {
    renderGuide('/guide/codex')
    const nav = screen.getByRole('navigation', { name: '文档' })
    expect(within(nav).getByRole('link', { name: '快速开始' })).toHaveAttribute('href', '/guide')
    expect(within(nav).getByRole('link', { name: 'Claude Code' })).toHaveAttribute('href', '/guide/claude-code')
    expect(within(nav).getByRole('link', { name: '常见错误与自查' })).toHaveAttribute('href', '/guide/troubleshooting')
    expect(within(nav).getByRole('link', { name: 'Codex' })).toHaveAttribute('aria-current', 'page')
  })

  it('fills the examples with the account model and group and this site address', async () => {
    renderGuide('/guide/codex')

    expect(await screen.findByText(/model = "responses-model"/)).toBeInTheDocument()
    expect(screen.getByText(/base_url = "https:\/\/api\.example\.test\/v1"/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('responses-model')
    expect(screen.getByRole('combobox', { name: '分组' })).toHaveDisplayValue('Standard route')
  })

  it('switches to the instructions of another platform in place', async () => {
    const user = userEvent.setup()
    renderGuide('/guide/codex')

    await user.click(screen.getByRole('tab', { name: 'Windows' }))

    expect(screen.getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('$env:YESCHOY_API_KEY = "sk-••••••"')).toBeInTheDocument()
  })

  it('copies the filled configuration with a masked key', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderGuide('/guide/codex')
    await screen.findByText(/model = "responses-model"/)

    const copy = screen.getByRole('button', { name: '复制 Codex 配置' })
    await user.click(copy)

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('base_url = "https://api.example.test/v1"'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('model = "responses-model"'))
    expect(copy).toHaveTextContent('已复制')
  })

  it('finds articles from the search box and links to the matching section', async () => {
    const user = userEvent.setup()
    renderGuide('/guide')

    await user.type(screen.getByRole('searchbox', { name: '搜索文档' }), 'invalid_api_key')

    expect(screen.getByRole('link', { name: /常见错误与自查/ })).toHaveAttribute('href', '/guide/troubleshooting#errors')
  })

  it('opens the article list in a dialog from the phone button', async () => {
    const user = userEvent.setup()
    renderGuide('/guide')

    await user.click(screen.getByRole('button', { name: '打开文档导航' }))

    const dialog = screen.getByRole('dialog', { name: '文档' })
    expect(within(dialog).getByRole('link', { name: 'Cherry Studio' })).toHaveAttribute('href', '/guide/cherry-studio')
  })

  it('shows the 404 page for an unknown article and for the quick start under its own slug', () => {
    renderGuide('/guide/missing')
    expect(screen.getByText('页面不存在')).toBeInTheDocument()
    cleanup()
    renderGuide('/guide/quick-start')
    expect(screen.getByText('页面不存在')).toBeInTheDocument()
  })

  it('asks a signed-out reader to sign in and keeps the copy of model-specific examples off', () => {
    authStore.clear()
    renderGuide('/guide/codex')

    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', `/sign-in?redirect=${encodeURIComponent('/guide/codex')}`)
    expect(screen.getByText(/model = "<model>"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制 Codex 配置' })).toBeDisabled()
  })

  it('says so when the account has no model for the article protocol', async () => {
    accountModels = []
    renderGuide('/guide/codex')

    expect(await screen.findByText('没有可用的兼容模型')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看模型' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: '复制 Codex 配置' })).toBeDisabled()
  })

  it('lets long filled-in addresses wrap instead of widening the page on phones', () => {
    renderGuide('/guide/troubleshooting')
    expect(screen.getByRole('article')).toHaveClass('break-words')
  })

  it('offers large-context settings for a model with a 1M window', async () => {
    renderGuide('/guide/codex')

    expect(await screen.findByText('此模型声明支持 1M 上下文窗口')).toBeInTheDocument()
    expect(screen.getByText(/model_context_window = 1000000/)).toBeInTheDocument()
    expect(screen.getByText(/model_auto_compact_token_limit = 900000/)).toBeInTheDocument()
  })
})
