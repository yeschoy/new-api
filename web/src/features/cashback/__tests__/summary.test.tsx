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
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CashbackSummary } from '../components/cashback-summary'

const summaryMocks = vi.hoisted(() => ({ rewardCount: 6 }))

vi.mock('../hooks/use-cashback', () => ({
  useCashbackSummary: () => ({
    isPending: false,
    isError: false,
    data: {
      pending_review_quota: 100,
      awaiting_maturity_quota: 200,
      issued_quota: 300,
      recovered_quota: 50,
      outstanding_reward_debt: 10,
      outstanding_principal_debt: 20,
      rejected_or_canceled_count: 4,
      incident_count: 2,
      settlement_failure_count: 0,
      reconciliation_issues: 0,
      risk_counts: { high: 0, severe: 0 },
      inviter_clusters: [
        {
          inviter_id: 42,
          distinct_invitees: 3,
          reward_count: summaryMocks.rewardCount,
          reward_quota: 900,
        },
      ],
      device_clusters: [
        { device_hash_short: 'devicehash12', account_count: 3 },
      ],
    },
  }),
}))

describe('cashback summary', () => {
  beforeEach(() => {
    summaryMocks.rewardCount = 6
  })

  it('shows the identities behind inviter and device risk clusters', () => {
    render(<CashbackSummary />)

    expect(screen.getByText('#42')).toBeVisible()
    expect(screen.getByText('devicehash12')).toBeVisible()
    expect(screen.getByText('Inviter clusters')).toBeVisible()
    expect(screen.getByText('Shared device clusters')).toBeVisible()
  })

  it.each([
    { count: 1, label: '1 reward' },
    { count: 6, label: '6 rewards' },
  ])(
    'shows $label when an inviter cluster has $count rewards',
    ({ count, label }) => {
      summaryMocks.rewardCount = count
      render(<CashbackSummary />)

      expect(screen.getByText(label, { exact: false })).toBeVisible()
    }
  )
})
