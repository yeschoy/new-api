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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore, type AuthUser } from '@/lib/auth-store'

import { UsagePage } from '../usage-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const NOW = Math.floor(Date.now() / 1000)
const HOUR = NOW - (NOW % 3600)

const USER: AuthUser = { id: 7, username: 'alice', role: 1, quota: 5_000_000, used_quota: 1_000_000, request_count: 42 }
const ADMIN: AuthUser = { ...USER, id: 1, username: 'root', role: 10 }

const ROWS = [
  { model_name: 'gpt-4o', created_at: HOUR - 3600, count: 30, quota: 1_000_000, token_used: 60_000 },
  { model_name: 'claude-sonnet', created_at: HOUR, count: 10, quota: 500_000, token_used: 12_000 },
]

type Params = Record<string, string | number>
type Handler = (params: Params) => unknown

function respond(overrides: Record<string, unknown | Handler> = {}, user: AuthUser = USER) {
  const table: Record<string, unknown | Handler> = {
    '/api/status': { quota_per_unit: 500_000, enable_data_export: true, data_export_default_time: 'hour' },
    '/api/user/self': user,
    '/api/data/self': ROWS,
    '/api/data/': ROWS,
    '/api/data/users': [
      { username: 'bob', created_at: HOUR - 3600, count: 20, quota: 1_500_000, token_used: 40_000 },
      { username: 'carol', created_at: HOUR, count: 5, quota: 500_000, token_used: 9_000 },
    ],
    '/api/perf-metrics/summary': { models: [] },
    '/api/log/self/summary': {
      requests: 12, failed: 1, quota: 1_000_000, tokens: 34_567, saved_quota: 250_000,
      daily: [
        { date: '2026-09-30', requests: 8, failed: 1, quota: 750_000, tokens: 30_000 },
        { date: '2026-09-29', requests: 4, failed: 0, quota: 250_000, tokens: 4_567 },
      ],
    },
    ...overrides,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: { params?: unknown }) => {
    const entry = table[url]
    const data = typeof entry === 'function' ? (entry as Handler)((config?.params ?? {}) as Params) : entry
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

function renderPage(path = '/dashboard/usage') {
  const router = createMemoryRouter([{ path: '*', element: <UsagePage /> }], { initialEntries: [path] })
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

async function tile(name: string) {
  return screen.findByRole('region', { name })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

describe('usage by model', () => {
  it('adds up requests, spend and tokens of the own account for the last 24 hours', async () => {
    respond()
    renderPage()
    expect(await within(await tile('请求数')).findByText('40')).toBeInTheDocument()
    expect(within(await tile('消费')).getByText('$3')).toBeInTheDocument()
    expect(within(await tile('Token 用量')).getByText('72,000')).toBeInTheDocument()
    const window = callsTo('/api/data/self')[0]
    expect(Number(window.end_timestamp) - Number(window.start_timestamp)).toBe(86_400)
  })

  it('divides by the minutes of the range for the per-minute rates', async () => {
    respond()
    renderPage()
    expect(await within(await tile('平均 RPM')).findByText('0.028')).toBeInTheDocument()
    expect(within(await tile('平均 TPM')).getByText('50')).toBeInTheDocument()
  })

  it('reads every account for admins and narrows to one username on request', async () => {
    respond({}, ADMIN)
    renderPage()
    await within(await tile('请求数')).findByText('40')
    expect(callsTo('/api/data/self')).toHaveLength(0)
    await userEvent.type(screen.getByRole('textbox', { name: '用户名' }), 'bob{Enter}')
    await waitFor(() => expect(callsTo('/api/data/').some((params) => params.username === 'bob')).toBe(true))
  })

  it('switches to seven days by day when that range is picked', async () => {
    respond()
    renderPage()
    await within(await tile('请求数')).findByText('40')
    await userEvent.click(screen.getByRole('button', { name: '近 7 天' }))
    await waitFor(() => {
      const last = callsTo('/api/data/self').at(-1) as Params
      expect(Number(last.end_timestamp) - Number(last.start_timestamp)).toBe(7 * 86_400)
    })
    expect(screen.getByRole('button', { name: '近 7 天' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: '时间粒度' })).toHaveValue('day')
  })

  it('queries a custom range typed into the date fields', async () => {
    respond()
    renderPage()
    await within(await tile('请求数')).findByText('40')
    await userEvent.click(screen.getByRole('button', { name: '自定义' }))
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-09-01T00:00' } })
    fireEvent.change(screen.getByLabelText('结束时间'), { target: { value: '2026-09-03T12:00' } })
    const start = new Date('2026-09-01T00:00').getTime() / 1000
    const end = new Date('2026-09-03T12:00').getTime() / 1000
    await waitFor(() => {
      expect(callsTo('/api/data/self').some((params) => params.start_timestamp === start && params.end_timestamp === end)).toBe(true)
    })
  })

  it('starts from the operator default granularity when the viewer saved none', async () => {
    respond({ '/api/status': { quota_per_unit: 500_000, enable_data_export: true, data_export_default_time: 'day' } })
    renderPage()
    await within(await tile('请求数')).findByText('40')
    const first = callsTo('/api/data/self')[0]
    expect(Number(first.end_timestamp) - Number(first.start_timestamp)).toBe(7 * 86_400)
    expect(screen.getByRole('combobox', { name: '时间粒度' })).toHaveValue('day')
  })

  it('shows the message of a range the server refuses', async () => {
    respond({ '/api/data/self': new Error('时间跨度不能超过 1 个月') })
    renderPage()
    expect(await screen.findByText('时间跨度不能超过 1 个月')).toBeInTheDocument()
  })

  it('lists each model in the spend chart legend, biggest first', async () => {
    respond()
    renderPage()
    const panel = await screen.findByRole('region', { name: '消费分布' })
    const legend = await within(panel).findAllByRole('button', { name: /gpt-4o|claude-sonnet/ })
    expect(legend.map((item) => item.textContent)).toEqual([expect.stringContaining('gpt-4o'), expect.stringContaining('claude-sonnet')])
  })

  it('ranks the models by requests in the call ranking', async () => {
    respond()
    renderPage()
    const panel = await screen.findByRole('region', { name: '模型调用分析' })
    await within(panel).findAllByRole('button', { name: /gpt-4o/ })
    await userEvent.click(within(panel).getByRole('button', { name: '调用排行' }))
    const rows = within(panel).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('gpt-4o')
    expect(rows[0]).toHaveTextContent('30')
    expect(rows[1]).toHaveTextContent('claude-sonnet')
  })

  it('shows each model share of the requests', async () => {
    respond()
    renderPage()
    const panel = await screen.findByRole('region', { name: '模型调用分析' })
    await within(panel).findAllByRole('button', { name: /gpt-4o/ })
    await userEvent.click(within(panel).getByRole('button', { name: '调用占比' }))
    expect(within(panel).getByText('75%')).toBeInTheDocument()
    expect(within(panel).getByText('25%')).toBeInTheDocument()
  })

  it('remembers the defaults the viewer saves and applies them', async () => {
    respond()
    renderPage()
    await within(await tile('请求数')).findByText('40')
    await userEvent.click(screen.getByRole('button', { name: '默认设置' }))
    const dialog = screen.getByRole('dialog', { name: '默认设置' })
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: '默认时间范围' }), '14')
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: '默认消费图表' }), 'area')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    const saved = JSON.parse(window.localStorage.getItem('dashboard_models_chart_preferences') ?? '{}')
    expect(saved).toMatchObject({ defaultTimeRangeDays: 14, consumptionDistributionChart: 'area' })
    expect(screen.getByRole('button', { name: '近 14 天' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '面积图' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when the operator has switched data collection off', async () => {
    respond({ '/api/status': { quota_per_unit: 500_000, enable_data_export: false } })
    renderPage()
    expect(await screen.findByText('管理员未开启数据看板，这里不会有新的统计数据。')).toBeInTheDocument()
  })
})

describe('usage by user', () => {
  it('is a view for admins only', async () => {
    respond()
    renderPage()
    await within(await tile('请求数')).findByText('40')
    expect(screen.queryByRole('tab', { name: '按用户' })).toBeNull()
  })

  it('ranks the accounts by spend', async () => {
    respond({}, ADMIN)
    renderPage('/dashboard/usage?view=users')
    const panel = await screen.findByRole('region', { name: '用户消费排行' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('bob')
    expect(rows[0]).toHaveTextContent('$3')
    expect(rows[1]).toHaveTextContent('carol')
  })

  it('keeps only the top accounts asked for', async () => {
    const six = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((username, index) => ({ username, created_at: HOUR, count: 1, quota: (index + 1) * 100_000, token_used: 10 }))
    respond({ '/api/data/users': six }, ADMIN)
    renderPage('/dashboard/usage?view=users')
    const panel = await screen.findByRole('region', { name: '用户消费排行' })
    expect(await within(panel).findAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: '前 5 名' }))
    expect(screen.getByRole('button', { name: '前 5 名' })).toHaveAttribute('aria-pressed', 'true')
    const rows = within(panel).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('u6')
  })
})

describe('daily report', () => {
  it('shows the totals and each day of the last ten days', async () => {
    respond()
    renderPage('/dashboard/usage?view=report')
    expect(await within(await tile('请求数')).findByText('12')).toBeInTheDocument()
    expect(within(await tile('节省')).getByText('$0.5')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('2026-09-30')).toBeInTheDocument()
    expect(within(table).getByText('30,000')).toBeInTheDocument()
    const window = callsTo('/api/log/self/summary')[0]
    expect(Number(window.end_timestamp) - Number(window.start_timestamp)).toBeLessThan(10 * 86_400)
  })

  it('exports the daily rows as CSV', async () => {
    respond()
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:report'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage('/dashboard/usage?view=report')
    await screen.findByText('2026-09-30')
    await userEvent.click(screen.getByRole('button', { name: '导出 CSV' }))
    const text = (await blobs[0].text()).replace(/^﻿/, '')
    expect(text.trim().split('\n')).toEqual(['日期,请求数,Token 用量,消费 ($)', '2026-09-30,8,30000,1.5', '2026-09-29,4,4567,0.5'])
  })
})
