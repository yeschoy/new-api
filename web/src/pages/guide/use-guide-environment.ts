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
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '@/lib/auth-store'
import { useCatalog } from '@/lib/queries'

import { getUserGroups, getUserModels } from './guide-api'
import { filterModelsForAudience } from './guide-runtime'
import type { GuideAudience } from './guide-types'

export type GuideEnvironmentStatus = 'signed-out' | 'loading' | 'error' | 'empty' | 'ready'

export type GuideSelection = { model: string; group: string }

export type GuideEnvironment = {
  status: GuideEnvironmentStatus
  /** The chosen model and group once checked against the account; '<model>' and '<group>' until then. */
  model: string
  group: string
  contextLength?: number
  models: string[]
  groups: Array<{ value: string; label: string }>
  setModel: (model: string) => void
  setGroup: (group: string) => void
  retry: () => void
}

/** Prefers the default group, else the first one. */
function pickGroup(groups: string[], wanted: string | undefined): string {
  if (wanted && groups.includes(wanted)) return wanted
  if (groups.includes('default')) return 'default'
  return groups[0] ?? ''
}

/**
 * The model and group the article's examples use: only what the signed-in
 * account can call through the article's protocol. The choice lives with the
 * caller (the page keeps it in the address); `onSelect` asks to change it.
 */
export function useGuideEnvironment(
  audience: GuideAudience,
  requested: { model?: string; group?: string },
  onSelect: (selection: GuideSelection) => void
): GuideEnvironment {
  const auth = useAuth()
  const signedIn = auth.status === 'authenticated'
  const viewer = auth.user?.id ?? null
  const catalog = useCatalog()
  const accountModels = useQuery({
    queryKey: ['guide', 'user-models', viewer],
    queryFn: () => getUserModels(),
    enabled: signedIn,
    staleTime: 60_000,
  })
  const accountGroups = useQuery({
    queryKey: ['guide', 'user-groups', viewer],
    queryFn: getUserGroups,
    enabled: signedIn,
    staleTime: 60_000,
  })
  const groupNames = useMemo(() => Object.keys(accountGroups.data ?? {}).sort((a, b) => a.localeCompare(b)), [accountGroups.data])
  const groupModels = useQueries({
    queries: groupNames.map((group) => ({
      queryKey: ['guide', 'group-models', viewer, group],
      queryFn: () => getUserModels(group),
      enabled: signedIn,
      staleTime: 60_000,
    })),
  })

  const models = useMemo(
    () => filterModelsForAudience(accountModels.data ?? [], catalog.models, audience),
    [accountModels.data, catalog.models, audience]
  )
  const groupsWith = (model: string) => groupNames.filter((_group, index) => groupModels[index]?.data?.includes(model))

  const model = requested.model && models.includes(requested.model) ? requested.model : (models[0] ?? '')
  const groups = groupsWith(model).map((value) => ({ value, label: accountGroups.data?.[value]?.desc || value }))
  const group = pickGroup(
    groups.map((item) => item.value),
    requested.group
  )

  const catalogBroken = catalog.isError || catalog.data?.success === false || (catalog.data !== undefined && !Array.isArray(catalog.data.data))
  let status: GuideEnvironmentStatus = 'ready'
  if (auth.status === 'loading') status = 'loading'
  else if (!signedIn) status = 'signed-out'
  else if (catalogBroken || accountModels.isError || accountGroups.isError || groupModels.some((query) => query.isError)) status = 'error'
  else if (catalog.isPending || accountModels.isPending || accountGroups.isPending || groupModels.some((query) => query.isPending)) status = 'loading'
  else if (!model || !group) status = 'empty'

  const ready = status === 'ready'
  return {
    status,
    model: ready ? model : '<model>',
    group: ready ? group : '<group>',
    contextLength: ready ? catalog.models.find((item) => item.model_name === model)?.context_length : undefined,
    models,
    groups,
    setModel: (next) => {
      if (models.includes(next)) onSelect({ model: next, group: pickGroup(groupsWith(next), group) })
    },
    setGroup: (next) => {
      if (groups.some((item) => item.value === next)) onSelect({ model, group: next })
    },
    retry: () => {
      void catalog.refetch()
      void accountModels.refetch()
      void accountGroups.refetch()
      for (const query of groupModels) void query.refetch()
    },
  }
}
