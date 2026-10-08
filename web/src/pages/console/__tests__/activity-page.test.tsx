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
import { authStore } from '@/lib/auth-store'

import { ActivityPage } from '../activity-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))
vi.mock('@/components/provider-icon', () => ({ ProviderIcon: () => null }))

const USER = { id: 7, username: 'alice', role: 1, quota: 5_000_000, used_quota: 0, request_count: 0, group: 'default' }

const CONSUME = {
  id: 11,
  user_id: 7,
  username: 'alice',
  created_at: 1_760_000_000,
  type: 2,
  content: '',
  token_name: 'prod-key',
  model_name: 'gpt-4o',
  quota: 50_000,
  prompt_tokens: 1200,
  completion_tokens: 300,
  use_time: 3,
  is_stream: true,
  channel: 4,
  channel_name: 'main-openai',
  token_id: 2,
  group: 'vip',
  ip: '',
  request_id: 'req-123',
  other: JSON.stringify({ model_ratio: 1.25, completion_ratio: 4, group_ratio: 0.5, cache_tokens: 640, frt: 800 }),
}

const AUDIT = {
  ...CONSUME,
  id: 12,
  type: 3,
  model_name: '',
  token_name: '',
  quota: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  content: 'Increased user quota by $1.00',
  request_id: '',
  other: JSON.stringify({ op: { action: 'user.quota_add', params: { quota: '$1.00' } } }),
}

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

type Config = { params?: Record<string, unknown> }

let responses: Record<string, unknown>

function respond(url: string) {
  return url in responses ? responses[url] : ok({})
}

beforeEach(() => {
  responses = {
    '/api/status': ok({ quota_per_unit: 500_000 }),
    '/api/user/self': ok(USER),
    '/api/log/self': ok({ items: [CONSUME, AUDIT], total: 2 }),
    '/api/log/': ok({ items: [CONSUME], total: 1 }),
    '/api/log/self/stat': ok({ quota: 1_500_000, rpm: 12, tpm: 3400 }),
    '/api/log/stat': ok({ quota: 0, rpm: 0, tpm: 0 }),
    '/api/log/self/summary': ok({ requests: 0, failed: 0, quota: 0, tokens: 0, daily: [] }),
    '/api/user/7': ok({ ...USER, quota: 2_500_000, used_quota: 500_000, request_count: 9 }),
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => respond(url))
  signIn(1)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

// The console frame refreshes the signed-in user from /api/user/self, so both carry the role.
function signIn(role: number) {
  responses['/api/user/self'] = ok({ ...USER, role })
  authStore.applyBundle({
    user: { ...USER, role },
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

function renderPage(path = '/activity') {
  const router = createMemoryRouter([{ path: '/activity', element: <ActivityPage /> }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

function paramsOf(url: string): Record<string, unknown> | undefined {
  const calls = vi.mocked(api.get).mock.calls.filter((call) => call[0] === url)
  return (calls.at(-1)?.[1] as Config | undefined)?.params
}

describe('activity page', () => {
  it('shows a user their own logs from midnight today until an hour from now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30, 0))
    renderPage()
    expect(await screen.findByText('prod-key')).toBeInTheDocument()
    expect(paramsOf('/api/log/self')).toEqual({
      p: 1,
      page_size: 20,
      start_timestamp: new Date(2026, 9, 2, 0, 0, 0).getTime() / 1000,
      end_timestamp: new Date(2026, 9, 2, 10, 30, 0).getTime() / 1000,
    })
    expect(screen.queryByRole('columnheader', { name: '用户' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '渠道' })).toBeNull()
  })

  it('shows tokens with the cache read and the cost of each request', async () => {
    renderPage()
    const row = (await screen.findByText('prod-key')).closest('tr') as HTMLElement
    expect(within(row).getByText('1,200')).toBeInTheDocument()
    expect(within(row).getByText('300')).toBeInTheDocument()
    expect(within(row).getByText(/640/)).toBeInTheDocument()
    expect(within(row).getByText('$0.1')).toBeInTheDocument()
    expect(within(row).getByText('vip')).toBeInTheDocument()
  })

  it('renders audit logs in the page language', async () => {
    renderPage()
    expect(await screen.findByText('增加用户额度 $1.00')).toBeInTheDocument()
  })

  it('shows spend, requests and tokens per minute for the applied filters', async () => {
    renderPage()
    expect(await screen.findByText('$3')).toBeInTheDocument()
    expect(screen.getByText('RPM').nextSibling).toHaveTextContent('12')
    expect(screen.getByText('TPM').nextSibling).toHaveTextContent('3,400')
  })

  it('searches with the typed model and the chosen type', async () => {
    const user = userEvent.setup()
    const router = renderPage()
    await screen.findByText('prod-key')
    await user.type(screen.getByRole('textbox', { name: '模型名称' }), 'gpt-4o')
    await user.selectOptions(screen.getByRole('combobox', { name: '日志类型' }), '5')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(paramsOf('/api/log/self')).toMatchObject({ model_name: 'gpt-4o', type: 5 }))
    expect(paramsOf('/api/log/self/stat')).toMatchObject({ model_name: 'gpt-4o', type: 5 })
    expect(router.state.location.search).toContain('model=gpt-4o')
  })

  it('reads the filters of an old link', async () => {
    renderPage('/activity?model=claude-3&token=ci&type=2&page=2')
    await screen.findByText('prod-key')
    expect(paramsOf('/api/log/self')).toMatchObject({ model_name: 'claude-3', token_name: 'ci', type: 2, p: 2 })
    expect(screen.getByRole('textbox', { name: '模型名称' })).toHaveValue('claude-3')
  })

  it('hides key names while sensitive values are hidden', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('prod-key')
    await user.click(screen.getByRole('button', { name: '隐藏敏感信息' }))
    expect(screen.queryByText('prod-key')).toBeNull()
    expect(screen.queryByText('$3')).toBeNull()
    expect(screen.getByRole('button', { name: '显示敏感信息' })).toBeInTheDocument()
  })

  it('opens the full details of a log', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /标准/ }))
    const dialog = screen.getByRole('dialog', { name: /日志详情/ })
    expect(within(dialog).getByText('req-123')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Token 明细' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: '计费详情' })).toBeInTheDocument()
    expect(within(dialog).getByText('0.5x')).toBeInTheDocument()
  })

  it('tells why the logs could not load', async () => {
    responses['/api/log/self'] = { data: { success: false, message: '数据库连接失败' } }
    renderPage()
    expect(await screen.findByText('数据库连接失败')).toBeInTheDocument()
  })
})

describe('activity page for admins', () => {
  beforeEach(() => signIn(10))

  it('starts on every user’s logs with the user and channel columns', async () => {
    renderPage()
    expect(await screen.findByText('main-openai')).toBeInTheDocument()
    expect(paramsOf('/api/log/')).toMatchObject({ p: 1 })
    expect(screen.getByRole('columnheader', { name: '用户' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '渠道' })).toBeInTheDocument()
  })

  it('switches to their own logs', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('main-openai')
    await user.click(screen.getByRole('button', { name: '仅自己' }))
    await waitFor(() => expect(paramsOf('/api/log/self')).toBeDefined())
    expect(screen.queryByRole('columnheader', { name: '用户' })).toBeNull()
  })

  it('opens the user behind a log', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'alice' }))
    const dialog = await screen.findByRole('dialog', { name: '用户信息' })
    expect(await within(dialog).findByText('$5')).toBeInTheDocument()
    expect(within(dialog).getByText('9')).toBeInTheDocument()
  })
})
