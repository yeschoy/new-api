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
import { useCallback, useEffect, useState } from 'react'

import { toast } from '@/components/ui'
import { useStatus } from '@/lib/queries'
import { DEFAULT_QUOTA_PER_UNIT } from '@/pages/console/console-helpers'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { runCheckout, type CheckoutAction } from './checkout'
import { creditQuota } from './topup-rules'
import { getWalletInfo } from './wallet-api'

/** Quota units in one USD, as the server counts them. */
export function useQuotaPerUnit(): number {
  const { data } = useStatus()
  return data?.quota_per_unit || DEFAULT_QUOTA_PER_UNIT
}

/** Quota credited for a top-up amount under the site's display settings. */
export function useCredit(): (amount: number) => number {
  const { data } = useStatus()
  const perUnit = useQuotaPerUnit()
  const displayType = data?.quota_display_type
  return useCallback((amount: number) => creditQuota(amount, displayType, perUnit), [displayType, perUnit])
}

/** `value`, once it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}

/** /api/user/topup/info, parsed; shared by every wallet section. */
export function useWalletInfo() {
  return useQuery({ queryKey: useConsoleKey('wallet-info'), queryFn: getWalletInfo, retry: false })
}

/**
 * Creates an order and opens the provider's checkout. `message` is shown when
 * the checkout opened in a new tab; `onDone` runs after any successful start.
 */
export function useCheckout(message: string, onDone: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (start: () => Promise<CheckoutAction>) => {
      const action = await start()
      runCheckout(action)
      return action
    },
    onSuccess: (action) => {
      if (action.kind !== 'redirect') toast.success(message)
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      onDone()
    },
  })
}
