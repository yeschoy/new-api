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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  CashbackIncidentKind,
  CashbackReward,
  CashbackRewardDetail,
  CashbackRewardFilters,
  CashbackRewardPage,
  CashbackSummary,
} from './types'

export async function getCashbackRewards(
  filters: CashbackRewardFilters
): Promise<ApiResponse<CashbackRewardPage>> {
  const res = await api.get<ApiResponse<CashbackRewardPage>>(
    '/api/cashback/rewards',
    {
      params: {
        p: filters.page,
        page_size: filters.pageSize,
        trade_no: filters.tradeNo || undefined,
        user_id: filters.userId || undefined,
        direction: filters.direction || undefined,
        review_status: filters.reviewStatus || undefined,
        settlement_status: filters.settlementStatus || undefined,
        risk_level: filters.riskLevel || undefined,
      },
    }
  )
  return res.data
}

export async function getCashbackReward(
  rewardId: number
): Promise<ApiResponse<CashbackRewardDetail>> {
  const res = await api.get<ApiResponse<CashbackRewardDetail>>(
    `/api/cashback/rewards/${rewardId}`,
    { disableDuplicate: true }
  )
  return res.data
}

export async function getCashbackSummary(): Promise<
  ApiResponse<CashbackSummary>
> {
  const res = await api.get<ApiResponse<CashbackSummary>>(
    '/api/cashback/summary'
  )
  return res.data
}

export async function reviewCashbackReward(
  rewardId: number,
  action: 'approve' | 'reject',
  reason: string
): Promise<
  ApiResponse<{
    reward: CashbackReward
    issued: boolean
    issue_error?: string
  }>
> {
  const res = await api.post(
    `/api/cashback/rewards/${rewardId}/review`,
    { action, reason },
    { skipErrorHandler: true }
  )
  return res.data
}

export async function recordCashbackIncident(
  topUpId: number,
  request: {
    kind: CashbackIncidentKind
    cumulative_refund_rate_bps: number
    reason: string
    evidence_ref: string
  }
): Promise<ApiResponse<unknown>> {
  const res = await api.post(
    `/api/cashback/topups/${topUpId}/incident`,
    request,
    { skipErrorHandler: true }
  )
  return res.data
}

export async function resolveCashbackRewardDebt(
  rewardId: number,
  reason: string
): Promise<ApiResponse<CashbackReward>> {
  const res = await api.post(
    `/api/cashback/rewards/${rewardId}/debt/resolve`,
    { reason },
    { skipErrorHandler: true }
  )
  return res.data
}

export async function resolveCashbackPrincipalDebt(
  topUpId: number,
  reason: string
): Promise<ApiResponse<unknown>> {
  const res = await api.post(
    `/api/cashback/orders/${topUpId}/principal-debt/resolve`,
    { reason },
    { skipErrorHandler: true }
  )
  return res.data
}
