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

import { FlowPage } from '../flow-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const USER: AuthUser = { id: 7, username: 'alice', role: 1, quota: 5_000_000, used_quota: 1_000_000, request_count: 42 }
const ADMIN: AuthUser = { ...USER, id: 1, username: 'admin', role: 10 }
const ROOT: AuthUser = { ...USER, id: 1, username: 'root', role: 100 }

// The own account's rows: key, group, model (the third key was deleted, so it has no name).
const SELF_ROWS = [
  { token_id: 1, token_name: 'prod', use_group: 'default', model_name: 'gpt-4o', count: 30, quota: 1_000_000, token_used: 60_000 },
  { token_id: 1, token_name: 'prod', use_group: 'vip', model_name: 'claude-sonnet', count: 10, quota: 500_000, token_used: 12_000 },
  { token_id: 2, use_group: 'default', model_name: 'gpt-4o', count: 5, quota: 100_000, token_used: 3_000 },
]

const ADMIN_ROWS = [
  { user_id: 3, username: 'bob', use_group: 'default', model_name: 'gpt-4o', channel_id: 9, channel_name: 'openai-main', count: 8, quota: 400_000, token_used: 9_000 },
  { user_id: 4, username: 'carol', use_group: 'vip', model_name: 'claude-sonnet', channel_id: 11, channel_name: 'anthropic', count: 2, quota: 100_000, token_used: 2_000 },
]

type Params = Record<string, string | number>

function respond(user: AuthUser, rows: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/api/status': { quota_per_unit: 500_000, enable_data_export: true, data_export_default_time: 'hour' },
    '/api/user/self': user,
    '/api/data/flow/self': SELF_ROWS,
    '/api/data/flow': ADMIN_ROWS,
    ...rows,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    const data = table[url]
    if (data instanceof Error) return { data: { success: false, message: data.message } }
    return { data: { success: true, message: '', data: data ?? {} } }
  })
  authStore.applyBundle({
    user,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <FlowPage /> }], { initialEntries: ['/dashboard/flow'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function callsTo(url: string): Params[] {
  return vi.mocked(api.get).mock.calls.filter((call) => call[0] === url).map((call) => (call[1] as { params: Params }).params)
}

/** The flow chart's node for a name. */
function node(name: string) {
  return screen.findByRole('button', { name })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

describe('flow of the own account', () => {
  it('follows the requests from key to group to model over the last 24 hours', async () => {
    respond(USER)
    renderPage()
    for (const name of ['prod', '已删除（2）', 'default', 'vip', 'gpt-4o', 'claude-sonnet']) expect(await node(name)).toBeInTheDocument()
    const window = callsTo('/api/data/flow/self')[0]
    expect(Number(window.end_timestamp) - Number(window.start_timestamp)).toBe(86_400)
    expect(screen.getByText(/合计 \$3\.2/)).toBeInTheDocument()
  })

  it('sizes the flow by requests when asked', async () => {
    respond(USER)
    renderPage()
    await node('gpt-4o')
    await userEvent.click(screen.getByRole('button', { name: '按请求数' }))
    expect(screen.getByRole('button', { name: '按请求数' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('35').length).toBeGreaterThan(0)
  })

  it('drops a column that is switched off, but keeps at least two', async () => {
    respond(USER)
    renderPage()
    await node('vip')
    await userEvent.click(screen.getByRole('button', { name: '分组' }))
    expect(screen.getByRole('button', { name: '分组' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'vip' })).toBeNull()
    expect(await node('gpt-4o')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型' })).toBeDisabled()
  })

  it('hides the key, group and other private names, but not the models', async () => {
    respond(USER)
    renderPage()
    await node('prod')
    await userEvent.click(screen.getByRole('button', { name: '隐藏敏感信息' }))
    expect(screen.queryByRole('button', { name: 'prod' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'vip' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '••••' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'gpt-4o' })).toBeInTheDocument()
  })

  it('highlights the paths through a clicked node until cleared', async () => {
    respond(USER)
    renderPage()
    const claude = await node('claude-sonnet')
    await userEvent.click(claude)
    expect(claude).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('已高亮：claude-sonnet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '清除高亮' }))
    expect(claude).toHaveAttribute('aria-pressed', 'false')
  })

  it('narrows the flow to the nodes picked in the filter', async () => {
    respond(USER)
    renderPage()
    await node('default')
    await userEvent.click(screen.getByRole('button', { name: /筛选节点/ }))
    const dialog = screen.getByRole('dialog', { name: '筛选节点' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /vip/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: '完成' }))
    expect(screen.queryByRole('button', { name: 'default' })).toBeNull()
    expect(screen.getByRole('button', { name: 'claude-sonnet' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '移除筛选：分组：vip' }))
    expect(await node('default')).toBeInTheDocument()
  })

  it('says when there is nothing to show', async () => {
    respond(USER, { '/api/data/flow/self': [] })
    renderPage()
    expect(await screen.findByText('暂无分流数据')).toBeInTheDocument()
  })

  it('shows why the server refused the range', async () => {
    respond(USER, { '/api/data/flow/self': new Error('时间跨度不能超过 1 个月') })
    renderPage()
    expect(await screen.findByText('时间跨度不能超过 1 个月')).toBeInTheDocument()
  })
})

describe('flow for admins', () => {
  it('follows every account from user to group, model and channel', async () => {
    respond(ADMIN)
    renderPage()
    for (const name of ['bob', 'carol', 'openai-main', 'anthropic']) expect(await node(name)).toBeInTheDocument()
    expect(callsTo('/api/data/flow/self')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '用户' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '渠道' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for one username when given', async () => {
    respond(ADMIN)
    renderPage()
    await node('bob')
    await userEvent.type(screen.getByRole('textbox', { name: '用户名' }), 'bob{Enter}')
    await waitFor(() => expect(callsTo('/api/data/flow').some((params) => params.username === 'bob')).toBe(true))
  })

  it('adds the node and key columns for the root account', async () => {
    respond(ROOT, { '/api/data/flow': [{ ...ADMIN_ROWS[0], node_name: 'node-a', token_id: 5, token_name: 'bob-key' }] })
    renderPage()
    expect(await node('node-a')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'bob-key' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '节点' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('merges the models past the display limit into one, or leaves them out', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...ADMIN_ROWS[0], model_name: `model-${index + 1}`, quota: (index + 1) * 10_000 }))
    respond(ADMIN, { '/api/data/flow': many })
    renderPage()
    await node('model-12')
    await userEvent.click(screen.getByRole('button', { name: '前 10 名' }))
    expect(await node('其他模型')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'model-1' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '不显示' }))
    expect(screen.queryByRole('button', { name: '其他模型' })).toBeNull()
    expect(screen.getByRole('button', { name: 'model-3' })).toBeInTheDocument()
  })
})
