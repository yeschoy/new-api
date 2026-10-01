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
import { useCallback } from 'react'

import { t } from '@/i18n/i18n'
import { authStore, useAuth } from '@/lib/auth-store'
import { formatAmount } from '@/lib/pricing'
import { useCurrency, useStatus } from '@/lib/queries'
import { getSelf } from '@/lib/services'

import { amountToQuota, formatQuota } from './console-helpers'

/**
 * Query-key prefix for signed-in data, scoped to the current user so a
 * different account never sees cached rows. Invalidate ['console'] to refresh all.
 */
export function useConsoleKey(...parts: unknown[]): unknown[] {
  const auth = useAuth()
  return ['console', auth.user?.id ?? 0, ...parts]
}

/** Fresh profile + balance; also refreshes the cached user in the auth store. */
export function useSelf() {
  return useQuery({
    queryKey: useConsoleKey('self'),
    queryFn: async () => {
      const user = await getSelf()
      if (!user) throw new Error(t('获取账户信息失败'))
      authStore.updateUser(user)
      return user
    },
  })
}

/** Quota units ⇄ the operator's display currency. */
export function useMoney() {
  const { data } = useStatus()
  const currency = useCurrency()
  const perUnit = data?.quota_per_unit
  const format = useCallback((quota: number | undefined) => formatQuota(quota, currency, perUnit), [currency, perUnit])
  const formatUsd = useCallback((usd: number) => formatAmount(usd, currency), [currency])
  const toQuota = useCallback((amount: number) => amountToQuota(amount, currency, perUnit), [currency, perUnit])
  return { format, formatUsd, toQuota, symbol: currency.symbol }
}
