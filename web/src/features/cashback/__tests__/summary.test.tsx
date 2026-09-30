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
import { act, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toIntlLocale } from '@/i18n/languages'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { CashbackSummary } from '../components/cashback-summary'
import { formatCashbackQuota } from '../lib/format'

const summaryMocks = vi.hoisted(() => ({ rewardCount: 6, issuedQuota: 300 }))

vi.mock('../hooks/use-cashback', () => ({
  useCashbackSummary: () => ({
    isPending: false,
    isError: false,
    data: {
      pending_review_quota: 100,
      awaiting_maturity_quota: 200,
      issued_quota: summaryMocks.issuedQuota,
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
  const originalConfig = useSystemConfigStore.getState().config

  beforeEach(() => {
    summaryMocks.rewardCount = 6
    summaryMocks.issuedQuota = 300
  })

  afterEach(async () => {
    useSystemConfigStore.setState({ config: originalConfig })
    await act(() => i18next.changeLanguage('en'))
  })

  it('shows cashback totals in CNY even when quota display is USD', () => {
    summaryMocks.issuedQuota = 1_500_000
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...originalConfig.currency,
        quotaDisplayType: 'USD',
        usdExchangeRate: 7,
      },
    })

    render(<CashbackSummary />)

    expect(screen.getByText('¥21')).toBeVisible()
    expect(screen.queryByText('$3')).not.toBeInTheDocument()
  })

  it.each([
    ['zhCN', '¥3'],
    ['zhTW', '¥3'],
    ['en', '¥3'],
    ['fr', '3\u00a0¥'],
    ['ru', '3\u00a0¥'],
    ['ja', '￥3'],
    ['vi', '3\u00a0¥'],
    ['invalid_locale', '¥3'],
  ])('formats quota as CNY for %s', (language, expected) => {
    expect(formatCashbackQuota(1_500_000, toIntlLocale(language))).toBe(
      expected
    )
    expect(formatCashbackQuota(1, toIntlLocale(language))).toMatch(/[,.]0+2/)
  })

  it('updates the CNY number formatting when the interface language changes', async () => {
    summaryMocks.issuedQuota = 1_500_000
    i18next.addResourceBundle('ja', 'translation', {
      'Issued cashback quota': '発行済み返金額',
    })
    render(<CashbackSummary />)
    expect(screen.getByText('¥3')).toBeVisible()

    await act(() => i18next.changeLanguage('ja'))

    expect(screen.getByText('￥3')).toBeVisible()
    expect(screen.queryByText('¥3')).not.toBeInTheDocument()
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
