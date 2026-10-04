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
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCashbackReward, recordCashbackIncident } from '../api'
import {
  cashbackQueryKeys,
  useCashbackReward,
  useRecordCashbackIncident,
} from '../hooks/use-cashback'
import type { CashbackRewardFilters } from '../types'

vi.mock('../api', () => ({
  getCashbackReward: vi.fn(),
  getCashbackRewards: vi.fn(),
  getCashbackSummary: vi.fn(),
  recordCashbackIncident: vi.fn(),
  resolveCashbackPrincipalDebt: vi.fn(),
  resolveCashbackRewardDebt: vi.fn(),
  reviewCashbackReward: vi.fn(),
}))

const filters: CashbackRewardFilters = {
  page: 1,
  pageSize: 20,
  tradeNo: '',
  userId: '',
  campaignId: '',
  direction: '',
  reviewStatus: '',
  settlementStatus: '',
  riskLevel: '',
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    )
  }
}

describe('cashback query invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refetches sensitive details every time the sheet is reopened', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    vi.mocked(getCashbackReward).mockResolvedValue({
      success: true,
      message: '',
      data: {} as never,
    })
    const { result, rerender } = renderHook(
      ({ rewardId }: { rewardId: number | null }) =>
        useCashbackReward(rewardId),
      {
        initialProps: { rewardId: 7 as number | null },
        wrapper: createWrapper(queryClient),
      }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ rewardId: null })
    rerender({ rewardId: 7 })

    await waitFor(() => expect(getCashbackReward).toHaveBeenCalledTimes(2))
    queryClient.clear()
  })

  it('invalidates every cached reward detail after an order-level incident', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    queryClient.setQueryData(cashbackQueryKeys.list(filters), { items: [] })
    queryClient.setQueryData(cashbackQueryKeys.detail(1), { reward: { id: 1 } })
    queryClient.setQueryData(cashbackQueryKeys.detail(2), { reward: { id: 2 } })
    queryClient.setQueryData(cashbackQueryKeys.summary(), {})
    vi.mocked(recordCashbackIncident).mockResolvedValue({
      success: true,
      message: '',
      data: {},
    })
    const { result } = renderHook(() => useRecordCashbackIncident(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        rewardId: 1,
        topUpId: 10,
        kind: 'refund',
        cumulativeRefundRateBPS: 5_000,
        reason: 'provider evidence',
        evidenceRef: '',
      })
    })

    expect(
      queryClient.getQueryState(cashbackQueryKeys.detail(1))?.isInvalidated
    ).toBe(true)
    expect(
      queryClient.getQueryState(cashbackQueryKeys.detail(2))?.isInvalidated
    ).toBe(true)
    queryClient.clear()
  })
})
