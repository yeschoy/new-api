import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getCashbackReward } from '../api'
import { CashbackDetailSheet } from '../components/cashback-detail-sheet'
import { formatCashbackQuota } from '../lib/format'
import type { CashbackRewardDetail } from '../types'

// jsdom has no Web Animations API; Base UI's scroll viewport queries it asynchronously.
HTMLElement.prototype.getAnimations ??= () => []

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCashbackReward: vi.fn(),
}))

const detail: CashbackRewardDetail = {
  reward: {
    id: 7,
    top_up_id: 12,
    trade_no: 'order',
    direction: 'invitee',
    invitee_id: 2,
    inviter_id: 1,
    beneficiary_id: 2,
    base_quota: 100,
    rate_bps: 500,
    calculated_quota: 5,
    reward_quota: 5,
    cap_reason: '',
    settlement_days: 7,
    config_version: 1,
    paid_at: 1700000000,
    available_at: 1700604800,
    review_status: 'approved',
    reviewed_by: 99,
    review_source: '',
    reviewed_at: 1700000001,
    review_reason: 'checked',
    settlement_status: 'frozen',
    issued_at: 0,
    risk_level: 'severe',
    risk_flags: [],
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
  order: {
    id: 4,
    top_up_id: 12,
    campaign_id: 1,
    trade_no: 'order',
    user_id: 2,
    payment_provider: 'stripe',
    base_quota: 100,
    credited_quota: 100,
    request_ip: '',
    request_user_agent_hash: '',
    device_fingerprint_hash: '',
    device_hash_short: '',
    device_signal_status: 'missing',
    eligible_after_first_enable: true,
    completion_source: 'provider_callback',
    completion_provider: 'stripe',
    incident_kind: '',
    incident_reason: '',
    incident_evidence_ref: '',
    incident_reported_by: 0,
    incident_reported_at: 0,
    cumulative_refund_rate_bps: 0,
    principal_reversal_target_quota: 0,
    principal_recovered_quota: 0,
    principal_outstanding_debt_quota: 0,
    principal_debt_resolved_at: 0,
    principal_debt_resolved_by: 0,
    principal_debt_resolution_reason: '',
    created_at: 1700000000,
    updated_at: 1700000000,
  },
  risk_snapshot: {},
  config_snapshot: {},
  invitee_username: 'payer',
  inviter_username: 'inviter',
  beneficiary_username: 'payer',
}

describe('cashback detail settlement eligibility', () => {
  it('shows internal quota alongside CNY only after opening reward details', async () => {
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: {
        ...detail,
        reward: {
          ...detail.reward,
          base_quota: 25_000_000,
          calculated_quota: 1_500_000,
          reward_quota: 1_500_000,
        },
        order: { ...detail.order, credited_quota: 25_000_000 },
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackDetailSheet rewardId={7} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findAllByText('Raw Quota: 25,000,000')).toHaveLength(2)
    expect(screen.getAllByText('Raw Quota: 1,500,000')).toHaveLength(2)
    expect(screen.getAllByText('¥50')).toHaveLength(2)
    queryClient.clear()
  })

  it('labels a frozen legacy manual payer as eligible while preserving the original hold date', async () => {
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: detail,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackDetailSheet rewardId={7} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(
      await screen.findByText('Eligible after manual approval')
    ).toBeVisible()
    expect(screen.getByText('Original hold date')).toBeVisible()
    expect(screen.getByText('Manual review')).toBeVisible()
    queryClient.clear()
  })

  it('keeps a historical pending/canceled zero reward and its reasons visible without approval actions', async () => {
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: {
        ...detail,
        reward: {
          ...detail.reward,
          review_status: 'pending',
          review_source: '',
          reviewed_by: 0,
          reviewed_at: 0,
          calculated_quota: 50,
          reward_quota: 0,
          cap_reason: 'daily_cap_exhausted',
          blocking_reason: 'no_payable_cashback_quota',
          settlement_status: 'canceled',
        },
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackDetailSheet rewardId={7} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Canceled')).toBeVisible()
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument()
    expect(screen.getByText('daily_cap_exhausted')).toBeVisible()
    expect(screen.getByText('no_payable_cashback_quota')).toBeVisible()
    expect(screen.getByText(formatCashbackQuota(50))).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reject' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Available at')).not.toBeInTheDocument()
    expect(
      screen.getByText('Original hold date').nextElementSibling
    ).toHaveTextContent('2023')
    queryClient.clear()
  })

  it('shows one original hold date for a canceled manually approved reward', async () => {
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: {
        ...detail,
        reward: { ...detail.reward, settlement_status: 'canceled' },
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackDetailSheet rewardId={7} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Canceled')).toBeVisible()
    expect(screen.getAllByText('Original hold date')).toHaveLength(1)
    expect(screen.queryByText('Available at')).not.toBeInTheDocument()
    queryClient.clear()
  })

  it('does not present the future hold date as the availability of an already issued manual reward', async () => {
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: {
        ...detail,
        reward: {
          ...detail.reward,
          settlement_status: 'issued',
          issued_at: detail.reward.reviewed_at,
        },
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackDetailSheet rewardId={7} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Original hold date')).toBeVisible()
    expect(screen.queryByText('Available at')).not.toBeInTheDocument()
    expect(screen.getByText('Issued at')).toBeVisible()
    queryClient.clear()
  })
})
