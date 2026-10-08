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

import { useCurrency, useStatus } from '@/lib/queries'
import { quotaToUsd } from '@/pages/console/console-helpers'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { getAutoGroupConfig, getKey, getUserGroups, getUserModels } from './keys-api'

/** What the create / edit form needs: the account's groups and auto order, its models, and the key being edited. */
export function useKeyDialogData(keyId?: number) {
  const groups = useQuery({ queryKey: useConsoleKey('key-groups'), queryFn: getUserGroups, staleTime: 60_000 })
  const auto = useQuery({ queryKey: useConsoleKey('key-auto-groups'), queryFn: getAutoGroupConfig, staleTime: 60_000 })
  const models = useQuery({ queryKey: useConsoleKey('key-models'), queryFn: getUserModels, staleTime: 5 * 60_000 })
  const detail = useQuery({
    queryKey: useConsoleKey('key', keyId),
    queryFn: () => getKey(keyId ?? 0),
    enabled: keyId !== undefined,
    staleTime: 0,
  })
  return { groups, auto, models, detail }
}

export type KeyDialogData = ReturnType<typeof useKeyDialogData>

/** Quota units → an amount in the operator's display currency (the inverse of useMoney().toQuota). */
export function useToAmount(): (quota: number) => number {
  const { data } = useStatus()
  const currency = useCurrency()
  const perUnit = data?.quota_per_unit
  return useCallback((quota: number) => quotaToUsd(quota, perUnit) * (currency.rate || 1), [currency, perUnit])
}
