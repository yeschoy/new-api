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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalHome } from '@/features/dashboard/components/overview/terminal-home'
import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'
import { renderApp } from '@/test-utils/render-app'

import { TerminalReports } from '../terminal-reports'
import { TerminalRequests } from '../terminal-requests'

const originalAdapter = api.defaults.adapter
const originalConfig = useSystemConfigStore.getState().config
let client: QueryClient
let summaryFails = false
let requestedWindow = 0
let requestedStart = 0
let requestOther: Record<string, unknown> = {}
let requestType = 2
let streamFails = true
const summary = {
  requests: 103,
  succeeded: 101,
  failed: 2,
  quota: 500000,
  tokens: 510,
  saved_quota: 250000,
  comparable_requests: 101,
  daily: [
    {
      date: '2026-09-08',
      requests: 101,
      succeeded: 100,
      failed: 1,
      quota: 400000,
      tokens: 500,
      saved_quota: 250000,
      comparable_requests: 100,
    },
    {
      date: '2026-09-07',
      requests: 2,
      succeeded: 1,
      failed: 1,
      quota: 100000,
      tokens: 10,
      saved_quota: 0,
      comparable_requests: 1,
    },
  ],
}

beforeEach(() => {
  summaryFails = false
  requestedWindow = 0
  requestOther = { group_ratio: 0.5 }
  requestType = 2
  streamFails = true
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
  client.setQueryData(
    ['pricing'],
    { data: [], vendors: [] },
    { updatedAt: Date.now() + 60000 }
  )
  useSystemConfigStore.setState({
    config: {
      ...originalConfig,
      currency: {
        ...originalConfig.currency,
        quotaPerUnit: 500000,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    },
  })
  api.defaults.adapter = async (config) => {
    const url = new URL(config.url ?? '', 'http://localhost')
    let data: unknown
    if (url.pathname === '/api/log/self/summary') {
      requestedStart = Number(config.params.start_timestamp)
      requestedWindow =
        Number(config.params.end_timestamp) -
        Number(config.params.start_timestamp) +
        1
      data = summaryFails
        ? { success: false, message: 'Report unavailable' }
        : { success: true, data: summary }
    } else if (url.pathname === '/api/token/') {
      data = { success: true, data: { items: [] } }
    } else if (url.pathname === '/api/log/self') {
      const page = Number(url.searchParams.get('p') ?? 1)
      data = {
        success: true,
        data: {
          page,
          page_size: 50,
          total: 103,
          items: [
            {
              id: page,
              user_id: 1,
              created_at: Math.floor(Date.now() / 1000),
              type: requestType,
              content: '',
              token_name: 'work-key',
              request_id: 'request-001',
              model_name: page === 1 ? 'partial-stream' : 'older-request',
              quota: 100000,
              prompt_tokens: 4,
              completion_tokens: 1,
              use_time: 4,
              is_stream: true,
              other: JSON.stringify({
                stream_status: {
                  status: streamFails ? 'error' : 'ok',
                  end_error: streamFails ? 'upstream timeout' : undefined,
                },
                ...requestOther,
              }),
            },
          ],
        },
      }
    } else throw new Error(`Unexpected request ${url.pathname}`)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(() => {
  vi.useRealTimers()
  api.defaults.adapter = originalAdapter
  client.clear()
  useSystemConfigStore.setState({ config: originalConfig })
})

describe('terminal usage views', () => {
  it('shows complete totals separately from a paginated request history', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <TerminalRequests />
      </QueryClientProvider>
    )
    await screen.findByText('partial-stream')
    expect(
      screen.getByText('Last 7 days').closest('article')
    ).toHaveTextContent('103')
    expect(screen.getByText('Spent').closest('article')).toHaveTextContent('¥7')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('older-request')).toBeVisible()
  })

  it('shows a charged failed stream and its actual error', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <TerminalRequests />
      </QueryClientProvider>
    )
    const row = (await screen.findByText('partial-stream')).closest('article')
    if (!row) throw new Error('Missing request row')
    expect(within(row).getByText('Failed')).toBeVisible()
    expect(within(row).getByText('Spend').nextElementSibling).toHaveTextContent(
      '¥1.4'
    )
    expect(
      within(row).getByText('Original price').nextElementSibling
    ).toHaveTextContent('¥2.8')
    expect(within(row).getByText('Saved').nextElementSibling).toHaveTextContent(
      '¥1.4'
    )
    await user.click(within(row).getByRole('button'))
    const details = await screen.findByRole('dialog', {
      name: 'Request details',
    })
    expect(
      within(details).getByText(
        'The response was interrupted before it finished.'
      )
    ).toBeVisible()
    await user.click(within(details).getByText('Original error'))
    expect(within(details).getByText('upstream timeout')).toBeVisible()
  })

  it.each([
    ['unrecorded multiplier', {}, 2, '¥1.4', '—', 'Saved', '—'],
    [
      'unrecorded multiplier with a recorded fee',
      { fee_quota: 84000 },
      2,
      '¥1.176',
      '—',
      'Saved',
      '—',
    ],
    ['full price', { group_ratio: 1 }, 2, '¥1.4', '¥1.4', 'Saved', '¥0'],
    [
      'surcharge',
      { group_ratio: 2 },
      2,
      '¥1.4',
      '¥0.7',
      'Above base price',
      '¥0.7',
    ],
    [
      'recorded fee',
      { group_ratio: 0.5, fee_quota: 84000 },
      2,
      '¥1.176',
      '¥2.352',
      'Saved',
      '¥1.176',
    ],
    [
      'subscription',
      { group_ratio: 0.5, billing_source: 'subscription' },
      2,
      'Subscription',
      '—',
      'Saved',
      '—',
    ],
    ['unbilled failure', { group_ratio: 0.5 }, 5, '—', '—', 'Saved', '—'],
  ] as const)(
    'shows truthful prices for %s',
    async (_name, other, type, spent, base, savedLabel, saved) => {
      requestOther = other
      requestType = type
      render(
        <QueryClientProvider client={client}>
          <TerminalRequests />
        </QueryClientProvider>
      )
      const row = (await screen.findByText('partial-stream')).closest('article')
      if (!row) throw new Error('Missing request row')
      expect(
        within(row).getByText('Spend').nextElementSibling
      ).toHaveTextContent(spent)
      expect(
        within(row).getByText('Original price').nextElementSibling
      ).toHaveTextContent(base)
      expect(
        within(row).getByText(savedLabel).nextElementSibling
      ).toHaveTextContent(saved)
    }
  )

  it('opens complete details for a successful request and returns focus after closing', async () => {
    const user = userEvent.setup()
    streamFails = false
    requestOther = {
      group_ratio: 0.5,
      model_ratio: 1,
      completion_ratio: 2,
      cache_tokens: 2,
      admin_info: { use_channel: [555] },
    }
    render(
      <QueryClientProvider client={client}>
        <TerminalRequests />
      </QueryClientProvider>
    )
    const row = (await screen.findByText('partial-stream')).closest('article')
    if (!row) throw new Error('Missing request row')
    const trigger = within(row).getByRole('button')
    await user.click(trigger)
    const details = await screen.findByRole('dialog', {
      name: 'Request details',
    })
    expect(
      within(details).getByText('Input Tokens').nextElementSibling
    ).toHaveTextContent('4')
    expect(
      within(details).getByText('Output Tokens').nextElementSibling
    ).toHaveTextContent('1')
    expect(
      within(details).getByText('Cache Read').nextElementSibling
    ).toHaveTextContent('2')
    expect(
      within(details).getByText('Discount on this request').nextElementSibling
    ).toHaveTextContent('50%')
    expect(
      within(details).getByText('Base input price').nextElementSibling
    ).toHaveTextContent('¥14')
    expect(
      within(details).getByText('Base output price').nextElementSibling
    ).toHaveTextContent('¥28')
    expect(within(details).queryByText('555')).toBeNull()
    await user.click(
      within(details).getByRole('button', { name: 'Copy request ID' })
    )
    expect(await navigator.clipboard.readText()).toBe('request-001')
    await user.click(within(details).getByRole('button', { name: 'Close' }))
    expect(trigger).toHaveFocus()
  })

  it('removes the unsupported reserved-balance card from the overview', async () => {
    await renderApp(<TerminalHome />, client)
    await screen.findByText('Connect your client')
    expect(screen.queryByText('Reserved')).toBeNull()
    expect(screen.queryByText('Not held separately on this gateway')).toBeNull()
  })

  it('renders the complete daily summary instead of rebuilding it from one log page', async () => {
    render(
      <QueryClientProvider client={client}>
        <TerminalReports />
      </QueryClientProvider>
    )
    expect(await screen.findByText('2026-09-08')).toBeVisible()
    const row = screen.getByRole('row', { name: /2026-09-08/ })
    expect(within(row).getByText('101')).toBeVisible()
    expect(within(row).getByText('¥5.6')).toBeVisible()
    expect(requestedWindow).toBe(10 * 86400)
    expect(
      screen.getByText(
        'Review the last 10 days of usage and export daily totals.'
      )
    ).toBeVisible()
  })

  it('keeps ten fixed-offset days when the interval crosses a daylight-saving change', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 2, 12))
    render(
      <QueryClientProvider client={client}>
        <TerminalReports />
      </QueryClientProvider>
    )
    await screen.findByText('2026-09-08')
    expect(requestedWindow).toBe(10 * 86400)
    expect(requestedStart).toBe(
      Date.UTC(2026, 9, 24) / 1000 + new Date().getTimezoneOffset() * 60
    )
  })

  it('shows summary failures instead of a successful empty report', async () => {
    summaryFails = true
    render(
      <QueryClientProvider client={client}>
        <TerminalReports />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Report unavailable'
    )
    expect(screen.getByRole('button', { name: 'Export report' })).toBeDisabled()
  })
})
