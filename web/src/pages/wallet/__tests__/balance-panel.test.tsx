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
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosRequestConfig } from 'axios'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { BalancePanel } from '../balance-panel'
import { USER, ok, renderPage, signIn } from './render'

// Paid $6 where list prices would have charged $8: $2 (25%) saved.
const SUMMARY = { requests: 120, succeeded: 118, failed: 2, quota: 3_000_000, subscription_quota: 0, tokens: 1_000_000, saved_quota: 1_000_000, comparable_requests: 100, daily: [] }

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('balance', () => {
  it('shows what the last 10 days saved against list prices, with the figures behind it', async () => {
    const windows: Array<{ start: number; end: number }> = []
    vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: AxiosRequestConfig) => {
      if (url === '/api/status') return ok({ quota_per_unit: 500_000 })
      if (url === '/api/user/self') return ok(USER)
      const params = config?.params as { start_timestamp: number; end_timestamp: number }
      windows.push({ start: params.start_timestamp, end: params.end_timestamp })
      return ok(SUMMARY)
    })
    renderPage(<BalancePanel />)

    const savings = await screen.findByRole('button', { name: '近 10 天节省 $2（25%）' })
    expect(savings).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('$6')).toBeNull()
    await userEvent.click(savings)

    expect(savings).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('$6')).toBeInTheDocument()
    expect(screen.getByText('$8')).toBeInTheDocument()
    // The summary endpoint refuses windows of 10 days or more.
    expect(windows[0].end - windows[0].start).toBeLessThan(10 * 86_400)
  })
})
