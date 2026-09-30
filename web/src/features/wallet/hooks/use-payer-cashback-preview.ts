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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/stores/auth-store'

import { getPayerCashbackPreview } from '../api'
import { getPayerCashbackRule, type PayerCashbackRule } from '../lib/cashback'

export type PayerCashbackSelection = {
  amount?: number
  productId?: string
}

/**
 * Read-only payer cashback estimate for the current wallet selection.
 * Checkout and verified completion never consume this response.
 */
export function usePayerCashbackPreview(selection: PayerCashbackSelection) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const debouncedAmount = useDebounce(selection.amount, 300)
  const selectionReady =
    !!selection.productId || selection.amount === debouncedAmount
  // Checkout methods have different minimums. Let the server validate the
  // selected amount against currently enabled providers instead of assuming
  // the form's default minimum applies to every method.
  const valid = selection.productId
    ? true
    : Number.isSafeInteger(selection.amount) && (selection.amount ?? -1) >= 0
  const query = useQuery({
    queryKey: [
      'payer-cashback-preview',
      userId,
      selection.productId ?? null,
      selection.amount ?? null,
    ],
    queryFn: async () => {
      if (selection.productId) {
        return getPayerCashbackPreview({ productId: selection.productId })
      }
      if (selection.amount === undefined) {
        throw new Error('Preview selection missing')
      }
      return getPayerCashbackPreview({ amount: selection.amount })
    },
    enabled:
      !!userId &&
      valid &&
      selectionReady &&
      !!(selection.productId || selection.amount),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { errorToast: false },
  })

  return { query, userId, valid, selectionReady }
}

export type PayerCashbackPreviewState = ReturnType<
  typeof usePayerCashbackPreview
>

/**
 * Keeps the last campaign rule proven by a settled preview so per-amount
 * hints do not flicker while a new amount is being checked.
 */
export function usePayerCashbackRule(
  state: PayerCashbackPreviewState
): PayerCashbackRule | null {
  const [rule, setRule] = useState<PayerCashbackRule | null>(null)
  const { data, isFetching, isError } = state.query
  useEffect(() => {
    if (isError) {
      setRule(null)
      return
    }
    if (isFetching) return
    const next = getPayerCashbackRule(data)
    if (next !== undefined) setRule(next)
  }, [data, isFetching, isError])
  return rule
}
