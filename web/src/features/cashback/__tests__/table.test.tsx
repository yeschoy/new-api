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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CashbackTable } from '../components/cashback-table'
import type { CashbackRewardPage } from '../types'

const page: CashbackRewardPage = {
  page: 1,
  page_size: 20,
  total: 1,
  items: [
    {
      id: 7,
      top_up_id: 12,
      trade_no: 'cashback-test-order',
      direction: 'inviter',
      invitee_id: 2,
      inviter_id: 1,
      beneficiary_id: 1,
      base_quota: 100000,
      rate_bps: 1000,
      calculated_quota: 10000,
      reward_quota: 8000,
      cap_reason: 'single_cap',
      settlement_days: 7,
      config_version: 1,
      paid_at: 1700000000,
      available_at: 1700604800,
      review_status: 'pending',
      reviewed_by: 0,
      reviewed_at: 0,
      review_reason: '',
      settlement_status: 'frozen',
      issued_at: 0,
      risk_level: 'high',
      risk_flags: ['shared_device_accounts'],
      blocking_reason: '',
      recovered_quota: 0,
      outstanding_debt_quota: 0,
      debt_resolved_at: 0,
      debt_resolved_by: 0,
      debt_resolution_reason: '',
      last_settlement_error: '',
      next_settlement_attempt_at: 0,
      created_at: 1700000000,
      updated_at: 1700000000,
    },
  ],
}

describe('cashback table', () => {
  it('opens a single reward without exposing a bulk action', () => {
    const onSelect = vi.fn()
    render(
      <CashbackTable
        page={page}
        isLoading={false}
        isError={false}
        onSelect={onSelect}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(onSelect).toHaveBeenCalledWith(7)
  })

  it('renders an explicit empty state', () => {
    render(
      <CashbackTable
        page={{ ...page, total: 0, items: [] }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText('No cashback rewards found')).toBeVisible()
  })
})
