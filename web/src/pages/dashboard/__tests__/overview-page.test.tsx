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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore, type AuthUser } from '@/lib/auth-store'

import { OverviewPage } from '../overview-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const NOW = Math.floor(Date.now() / 1000)
const HOUR = NOW - (NOW % 3600)

const USER: AuthUser = { id: 7, username: 'alice', role: 1, quota: 5_000_000, used_quota: 1_000_000, request_count: 42 }

const STATUS = {
  quota_per_unit: 500_000,
  server_address: 'https://api.example.com',
  announcements_enabled: true,
  announcements: [
    { id: 2, content: '新模型上线\n欢迎试用', extra: '', publishDate: '2026-09-21T18:52:48.914Z', type: 'default' },
    { id: 1, content: '<p>周末维护</p>', extra: '维护期间接口可能短暂不可用', publishDate: '2026-08-29T14:38:52.820Z', type: 'ongoing' },
  ],
  api_info_enabled: true,
  api_info: [{ url: 'https://edge.example.com', route: '全球加速', description: 'Cloudflare 线路', color: 'blue' }],
  faq_enabled: true,
  faq: [{ id: 1, question: '如何充值？', answer: '在钱包页面输入兑换码。' }],
  uptime_kuma_enabled: true,
}

type Responses = Record<string, unknown>

function responses(overrides: Responses = {}): Responses {
  return {
    '/api/status': STATUS,
    '/api/user/self': USER,
    '/api/data/self': [
      { model_name: 'gpt-4o', created_at: HOUR - 3600, count: 3, quota: 250_000, token_used: 1200 },
      { model_name: 'claude-sonnet', created_at: HOUR, count: 2, quota: 250_000, token_used: 800 },
    ],
    '/api/log/self/summary': { requests: 5, succeeded: 5, failed: 0, quota: 300_000, subscription_quota: 0, tokens: 2000, saved_quota: 150_000, comparable_requests: 5, daily: [] },
    '/api/token/': { items: [{ id: 1, name: 'prod', key: 'abcd****wxyz', status: 1 }], total: 1 },
    '/api/uptime/status': [{ categoryName: '核心服务', monitors: [{ name: '对话接口', uptime: 0.9987, status: 1, group: '主站' }] }],
    '/api/perf-metrics/summary': { models: [
      { model_name: 'gpt-4o', avg_latency_ms: 1234, success_rate: 99.5, avg_tps: 45.6, request_count: 100 },
      { model_name: 'claude-sonnet', avg_latency_ms: 800, success_rate: 100, avg_tps: 60, request_count: 50 },
    ] },
    ...overrides,
  }
}

function mockApi(table: Responses) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: { success: true, message: '', data: table[url] ?? {} } }))
}

function signIn(user: AuthUser) {
  authStore.applyBundle({
    user,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <OverviewPage /> }], { initialEntries: ['/dashboard'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

describe('overview account summary', () => {
  beforeEach(() => {
    mockApi(responses())
    signIn(USER)
  })

  it('shows the balance, total spend and request count of the account', async () => {
    renderPage()
    const summary = await screen.findByRole('region', { name: '账户概览' })
    expect(await within(summary).findByText('$10')).toBeInTheDocument()
    expect(within(summary).getByText('$2')).toBeInTheDocument()
    expect(within(summary).getByText('42')).toBeInTheDocument()
  })

  it('sums the last 24 hours of usage and estimates how long the balance lasts', async () => {
    renderPage()
    const tile = await screen.findByRole('region', { name: '近 24 小时消费' })
    expect(await within(tile).findByText('$1')).toBeInTheDocument()
    expect(await screen.findByText('预计可用约 10 天')).toBeInTheDocument()
    expect(screen.getByText('余额充足')).toBeInTheDocument()
  })

  it('asks the server for exactly the last 24 hours of the own account', async () => {
    renderPage()
    await screen.findByText('预计可用约 10 天')
    const call = vi.mocked(api.get).mock.calls.find((item) => item[0] === '/api/data/self')
    const params = (call?.[1] as { params: { start_timestamp: number; end_timestamp: number } }).params
    expect(params.end_timestamp - params.start_timestamp).toBe(86_400)
  })

  it('shows what the group rates saved today', async () => {
    renderPage()
    const tile = await screen.findByRole('region', { name: '今日节省' })
    expect(await within(tile).findByText('$0.3')).toBeInTheDocument()
  })

  it('warns when the balance is used up', async () => {
    vi.mocked(api.get).mockRestore()
    mockApi(responses({ '/api/user/self': { ...USER, quota: 0 } }))
    renderPage()
    expect(await screen.findAllByText('余额已用完')).not.toHaveLength(0)
  })
})

describe('overview get started', () => {
  it('walks a new account through funding, a key and the first request', async () => {
    const fresh: AuthUser = { ...USER, quota: 0, used_quota: 0, request_count: 0 }
    mockApi(responses({ '/api/user/self': fresh, '/api/token/': { items: [], total: 0 }, '/api/data/self': [] }))
    signIn(fresh)
    renderPage()
    const steps = await screen.findByRole('region', { name: '开始使用' })
    expect(within(steps).getByText('完成 0/3 步')).toBeInTheDocument()
    expect(within(steps).getByRole('link', { name: '去充值' })).toHaveAttribute('href', '/settings/credits')
  })

  it('points to the key page once the account has credit', async () => {
    const funded: AuthUser = { ...USER, request_count: 0 }
    mockApi(responses({ '/api/user/self': funded, '/api/token/': { items: [], total: 0 } }))
    signIn(funded)
    renderPage()
    const steps = await screen.findByRole('region', { name: '开始使用' })
    expect(await within(steps).findByText('完成 1/3 步')).toBeInTheDocument()
    expect(within(steps).getByRole('link', { name: '创建密钥' })).toHaveAttribute('href', '/settings/keys')
  })

  it('leaves the steps out once the fresh account shows all three done', async () => {
    mockApi(responses())
    // The session still remembers no requests; the account itself has made 42.
    signIn({ ...USER, request_count: 0 })
    renderPage()
    const summary = await screen.findByRole('region', { name: '账户概览' })
    await within(summary).findByText('42')
    // The key list has loaded once the connect panel offers to manage the keys.
    await screen.findByRole('link', { name: '管理密钥' })
    expect(screen.queryByRole('region', { name: '开始使用' })).toBeNull()
  })

  it('shows the base URL to connect clients with', async () => {
    mockApi(responses())
    signIn(USER)
    renderPage()
    expect(await screen.findByText('https://api.example.com/v1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '管理密钥' })).toHaveAttribute('href', '/settings/keys')
  })
})

describe('overview content panels', () => {
  beforeEach(() => {
    signIn(USER)
  })

  it('opens an announcement in a dialog with its details', async () => {
    mockApi(responses())
    renderPage()
    const panel = await screen.findByRole('region', { name: '公告' })
    await userEvent.click(within(panel).getByRole('button', { name: /周末维护/ }))
    const dialog = screen.getByRole('dialog', { name: '公告详情' })
    expect(within(dialog).getByText('周末维护')).toBeInTheDocument()
    expect(within(dialog).getByText('维护期间接口可能短暂不可用')).toBeInTheDocument()
  })

  it('keeps the line breaks of plain-text announcements', async () => {
    mockApi(responses())
    renderPage()
    const panel = await screen.findByRole('region', { name: '公告' })
    await userEvent.click(within(panel).getByRole('button', { name: /新模型上线/ }))
    const dialog = screen.getByRole('dialog', { name: '公告详情' })
    expect(within(dialog).getByText(/新模型上线\s+欢迎试用/)).toHaveClass('whitespace-pre-wrap')
  })

  it('opens and closes an FAQ answer', async () => {
    mockApi(responses())
    renderPage()
    const question = await screen.findByRole('button', { name: '如何充值？' })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('在钱包页面输入兑换码。')).not.toBeVisible()
    await userEvent.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('在钱包页面输入兑换码。')).toBeVisible()
    await userEvent.click(question)
    expect(screen.getByText('在钱包页面输入兑换码。')).not.toBeVisible()
  })

  it('lists API routes with their address', async () => {
    mockApi(responses())
    renderPage()
    const panel = await screen.findByRole('region', { name: 'API 线路' })
    expect(within(panel).getByText('全球加速')).toBeInTheDocument()
    expect(within(panel).getByText('https://edge.example.com')).toBeInTheDocument()
  })

  it('shows empty states when the operator left the lists empty', async () => {
    mockApi(responses({ '/api/status': { ...STATUS, api_info: [], faq: [], announcements: [] } }))
    renderPage()
    expect(await screen.findByText('暂无 API 线路')).toBeInTheDocument()
    expect(screen.getByText('暂无常见问题')).toBeInTheDocument()
    expect(screen.getByText('暂无公告')).toBeInTheDocument()
  })

  it('hides the panels the operator switched off', async () => {
    mockApi(responses({ '/api/status': { ...STATUS, announcements_enabled: false, api_info_enabled: false, faq_enabled: false, uptime_kuma_enabled: false } }))
    renderPage()
    await screen.findByRole('region', { name: '账户概览' })
    expect(screen.queryByRole('region', { name: '公告' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'API 线路' })).toBeNull()
    expect(screen.queryByRole('region', { name: '常见问题' })).toBeNull()
    expect(screen.queryByRole('region', { name: '服务状态' })).toBeNull()
    expect(vi.mocked(api.get).mock.calls.some((call) => call[0] === '/api/uptime/status')).toBe(false)
  })

  it('shows each monitor with its uptime', async () => {
    mockApi(responses())
    renderPage()
    const panel = await screen.findByRole('region', { name: '服务状态' })
    expect(await within(panel).findByText('对话接口')).toBeInTheDocument()
    expect(within(panel).getByText('99.87%')).toBeInTheDocument()
    expect(within(panel).getByText('核心服务')).toBeInTheDocument()
  })

  it('reloads the monitors on refresh', async () => {
    mockApi(responses())
    renderPage()
    const panel = await screen.findByRole('region', { name: '服务状态' })
    await within(panel).findByText('对话接口')
    const before = vi.mocked(api.get).mock.calls.filter((call) => call[0] === '/api/uptime/status').length
    await userEvent.click(within(panel).getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(vi.mocked(api.get).mock.calls.filter((call) => call[0] === '/api/uptime/status').length).toBe(before + 1)
    })
  })
})

describe('overview performance health', () => {
  it('shows admins the success rate, latency and throughput of the last 24 hours', async () => {
    const admin: AuthUser = { ...USER, role: 10 }
    mockApi(responses({ '/api/user/self': admin }))
    signIn(admin)
    renderPage()
    const panel = await screen.findByRole('region', { name: '性能健康' })
    expect(await within(panel).findByText('99.75%')).toBeInTheDocument()
    expect(within(panel).getByText('1.02s')).toBeInTheDocument()
    expect(within(panel).getByText('52.8 t/s')).toBeInTheDocument()
  })

  it('is not shown to regular users', async () => {
    mockApi(responses())
    signIn(USER)
    renderPage()
    await screen.findByRole('region', { name: '账户概览' })
    expect(screen.queryByRole('region', { name: '性能健康' })).toBeNull()
  })
})
