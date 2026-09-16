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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getCashbackReward,
  getCashbackRewards,
  getCashbackSummary,
  recordCashbackIncident,
  resolveCashbackPrincipalDebt,
  resolveCashbackRewardDebt,
  reviewCashbackReward,
} from '../api'
import type { CashbackIncidentKind, CashbackRewardFilters } from '../types'

export const cashbackQueryKeys = {
  all: ['cashback'] as const,
  lists: () => [...cashbackQueryKeys.all, 'rewards'] as const,
  list: (filters: CashbackRewardFilters) =>
    [...cashbackQueryKeys.lists(), filters] as const,
  details: () => [...cashbackQueryKeys.all, 'reward'] as const,
  detail: (rewardId: number | null) =>
    [...cashbackQueryKeys.details(), rewardId] as const,
  summary: () => [...cashbackQueryKeys.all, 'summary'] as const,
}

export function useCashbackRewards(filters: CashbackRewardFilters) {
  return useQuery({
    queryKey: cashbackQueryKeys.list(filters),
    queryFn: async () => {
      const response = await getCashbackRewards(filters)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load cashback rewards')
      }
      return response.data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCashbackReward(rewardId: number | null) {
  return useQuery({
    queryKey: cashbackQueryKeys.detail(rewardId),
    queryFn: async () => {
      if (!rewardId) throw new Error('Reward id is required')
      const response = await getCashbackReward(rewardId)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load cashback details')
      }
      return response.data
    },
    enabled: rewardId !== null,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useCashbackSummary() {
  return useQuery({
    queryKey: cashbackQueryKeys.summary(),
    queryFn: async () => {
      const response = await getCashbackSummary()
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load cashback summary')
      }
      return response.data
    },
  })
}

function useInvalidateCashback() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: cashbackQueryKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: cashbackQueryKeys.details() }),
      queryClient.invalidateQueries({ queryKey: cashbackQueryKeys.summary() }),
    ])
  }
}

export function useReviewCashbackReward() {
  const invalidate = useInvalidateCashback()
  return useMutation({
    mutationFn: (input: {
      rewardId: number
      action: 'approve' | 'reject'
      reason: string
    }) => reviewCashbackReward(input.rewardId, input.action, input.reason),
    onSuccess: () => invalidate(),
  })
}

export function useRecordCashbackIncident() {
  const invalidate = useInvalidateCashback()
  return useMutation({
    mutationFn: (input: {
      rewardId: number
      topUpId: number
      kind: CashbackIncidentKind
      cumulativeRefundRateBPS: number
      reason: string
      evidenceRef: string
    }) =>
      recordCashbackIncident(input.topUpId, {
        kind: input.kind,
        cumulative_refund_rate_bps: input.cumulativeRefundRateBPS,
        reason: input.reason,
        evidence_ref: input.evidenceRef,
      }),
    onSuccess: () => invalidate(),
  })
}

export function useResolveCashbackRewardDebt() {
  const invalidate = useInvalidateCashback()
  return useMutation({
    mutationFn: (input: { rewardId: number; reason: string }) =>
      resolveCashbackRewardDebt(input.rewardId, input.reason),
    onSuccess: () => invalidate(),
  })
}

export function useResolveCashbackPrincipalDebt() {
  const invalidate = useInvalidateCashback()
  return useMutation({
    mutationFn: (input: {
      rewardId: number
      topUpId: number
      reason: string
    }) => resolveCashbackPrincipalDebt(input.topUpId, input.reason),
    onSuccess: () => invalidate(),
  })
}
