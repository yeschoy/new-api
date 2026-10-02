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
import { useMemo } from 'react'

import { formatAmount } from '@/lib/pricing'
import { useCurrency, useStatus } from '@/lib/queries'
import { quotaToUsd } from '@/pages/console/console-helpers'

/**
 * Quota units as amounts in the operator's display currency, so chart axes
 * step in round amounts of that currency, and the amounts formatted.
 */
export function useAmount() {
  const { data } = useStatus()
  const currency = useCurrency()
  const perUnit = data?.quota_per_unit
  return useMemo(
    () => ({
      of: (quota: number) => quotaToUsd(quota, perUnit) * (currency.rate || 1),
      format: (amount: number) => formatAmount(amount, { symbol: currency.symbol, rate: 1 }),
      symbol: currency.symbol,
    }),
    [perUnit, currency]
  )
}
