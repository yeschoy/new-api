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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { TerminalReports } from '../terminal-reports'
import { TerminalRequests } from '../terminal-requests'

const originalAdapter = api.defaults.adapter
const originalConfig = useSystemConfigStore.getState().config
let client: QueryClient
let summaryFails = false
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
      data = summaryFails
        ? { success: false, message: 'Report unavailable' }
        : { success: true, data: summary }
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
              type: 2,
              content: '',
              model_name: page === 1 ? 'partial-stream' : 'older-request',
              quota: 100000,
              prompt_tokens: 4,
              completion_tokens: 1,
              use_time: 4,
              is_stream: true,
              other: JSON.stringify({
                stream_status: {
                  status: 'error',
                  end_error: 'upstream timeout',
                },
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
    expect(within(row).getByText('¥1.4')).toBeVisible()
    await user.click(within(row).getByRole('button'))
    expect(await screen.findByText('upstream timeout')).toBeVisible()
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
