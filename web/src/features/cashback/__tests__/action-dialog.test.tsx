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
import { describe, expect, it } from 'vitest'

import { CashbackActionDialog } from '../components/cashback-action-dialog'
import type { CashbackRewardDetail } from '../types'

const detail: CashbackRewardDetail = {
  reward: {
    id: 7,
    top_up_id: 12,
    trade_no: 'order',
    direction: 'inviter',
    invitee_id: 2,
    inviter_id: 1,
    beneficiary_id: 1,
    base_quota: 100,
    rate_bps: 1000,
    calculated_quota: 10,
    reward_quota: 10,
    cap_reason: '',
    settlement_days: 7,
    config_version: 1,
    paid_at: 1,
    available_at: 2,
    review_status: 'pending',
    reviewed_by: 0,
    reviewed_at: 0,
    review_reason: '',
    settlement_status: 'frozen',
    issued_at: 0,
    risk_level: 'high',
    risk_flags: ['new_account'],
    blocking_reason: '',
    recovered_quota: 0,
    outstanding_debt_quota: 0,
    debt_resolved_at: 0,
    debt_resolved_by: 0,
    debt_resolution_reason: '',
    last_settlement_error: '',
    next_settlement_attempt_at: 0,
    created_at: 1,
    updated_at: 1,
  },
  order: {
    id: 4,
    top_up_id: 12,
    trade_no: 'order',
    user_id: 2,
    payment_provider: 'stripe',
    base_quota: 100,
    credited_quota: 100,
    request_ip: '203.0.113.1',
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
    created_at: 1,
    updated_at: 1,
  },
  risk_snapshot: {},
  config_snapshot: {},
  invitee_username: 'invitee',
  inviter_username: 'inviter',
  beneficiary_username: 'inviter',
}

describe('cashback action dialog', () => {
  it('requires a reason before approving a high-risk reward', () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackActionDialog
          action='approve'
          detail={detail}
          open
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>
    )

    const confirm = screen.getByRole('button', { name: 'Confirm action' })
    expect(confirm).toBeDisabled()
    const reason = screen.getByRole('textbox', { name: 'Reason' })
    expect(reason).toHaveAttribute('aria-required', 'true')
    expect(reason).toHaveAccessibleDescription(
      'A reason is required for this cashback action.'
    )
    fireEvent.change(reason, { target: { value: 'Reviewed linked accounts' } })
    expect(confirm).toBeEnabled()

    queryClient.clear()
  })
})
