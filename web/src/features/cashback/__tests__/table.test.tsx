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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getCashbackRewards, getCashbackSummary } from '../api'
import { CashbackTable } from '../components/cashback-table'
import { Cashback } from '../index'
import { formatCashbackQuota } from '../lib/format'
import type { CashbackRewardPage } from '../types'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCashbackRewards: vi.fn(),
  getCashbackSummary: vi.fn(),
}))

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
      review_source: '',
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
  it('lets admins scroll past the filters to reach loaded orders', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(getCashbackRewards).mockResolvedValue({
      success: true,
      message: '',
      data: page,
    })
    vi.mocked(getCashbackSummary).mockResolvedValue({
      success: true,
      message: '',
      data: {
        pending_review_quota: 0,
        awaiting_maturity_quota: 0,
        issued_quota: 0,
        recovered_quota: 0,
        outstanding_reward_debt: 0,
        outstanding_principal_debt: 0,
        rejected_or_canceled_count: 0,
        incident_count: 0,
        settlement_failure_count: 0,
        reconciliation_issues: 0,
        risk_counts: {},
        inviter_clusters: [],
        device_clusters: [],
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <Cashback />
      </QueryClientProvider>
    )

    const order = await screen.findByText('cashback-test-order')
    const content = order.closest('.dopa-section-page__content')
    expect(content).toHaveClass('overflow-auto')
    expect(content).not.toHaveClass('overflow-hidden')
    queryClient.clear()
  })

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
    expect(screen.getByText('Pending review')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(onSelect).toHaveBeenCalledWith(7)
  })

  it.each([
    { total: 1, label: '1 reward' },
    { total: 2, label: '2 rewards' },
  ])('shows $label when the result count is $total', ({ total, label }) => {
    render(
      <CashbackTable
        page={{ ...page, total }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText(label)).toBeVisible()
  })

  it('shows a fixed-per-100 reward as a fixed return rather than zero percent', () => {
    render(
      <CashbackTable
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              base_quota: 50_500_000,
              strategy: 'per_hundred',
              fixed_per_hundred: 6,
              rate_bps: 0,
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText('Every 100 of top-up returns 6')).toBeVisible()
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  })

  it('shows an automatically reviewed severe payer reward without hiding its risk', () => {
    render(
      <CashbackTable
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              direction: 'invitee',
              review_status: 'approved',
              review_source: 'automatic',
              risk_level: 'severe',
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText('Top-up payer')).toBeVisible()
    expect(screen.getByText('Automatic review')).toBeVisible()
    expect(screen.getByText('Severe risk')).toBeVisible()
  })

  it('shows manual payer eligibility without replacing the original hold date', () => {
    render(
      <CashbackTable
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              id: 7,
              direction: 'invitee',
              review_status: 'approved',
              review_source: '',
              reviewed_by: 12,
            },
            {
              ...page.items[0],
              id: 8,
              direction: 'invitee',
              review_status: 'approved',
              review_source: 'automatic',
              reviewed_by: 0,
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText('Eligible after manual approval')).toBeVisible()
    expect(screen.getByText(/Original hold date:/)).toBeVisible()
    expect(screen.getAllByText('Top-up payer')).toHaveLength(2)
    expect(screen.getAllByText('Eligible after manual approval')).toHaveLength(
      1
    )
  })

  it('shows the actual credit time and original hold date for an issued manual payer reward', () => {
    render(
      <CashbackTable
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              direction: 'invitee',
              review_status: 'approved',
              review_source: 'manual',
              reviewed_by: 12,
              settlement_status: 'issued',
              issued_at: 1700000100,
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Issued at:.*2023/)).toBeVisible()
    expect(screen.getByText(/Original hold date:.*2023/)).toBeVisible()
    expect(
      screen.queryByText('Eligible after manual approval')
    ).not.toBeInTheDocument()
  })

  it('shows a canceled zero reward without a pending-review label or future payout date', () => {
    render(
      <CashbackTable
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              calculated_quota: 50,
              reward_quota: 0,
              cap_reason: 'daily_cap_exhausted',
              review_status: 'pending',
              settlement_status: 'canceled',
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onSelect={vi.fn()}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText('Canceled')).toBeVisible()
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument()
    expect(screen.getByText(formatCashbackQuota(50))).toBeVisible()
    expect(screen.queryByText(/2023-11-\d+/)).not.toBeInTheDocument()
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
