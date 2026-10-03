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
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useAuth } from '@/lib/auth-store'
import { ROLE_ADMIN, ROLE_ROOT } from '@/pages/console/console-nav'

import type { LogScope } from './log-types'

/**
 * Whose logs a page shows. Admins start on everyone's ('all') and may switch
 * to their own; everyone else only ever sees their own. Switching goes back
 * to the first page.
 */
export function useLogScope() {
  const role = useAuth().user?.role ?? 0
  const [chosen, setChosen] = useState<LogScope>('all')
  const [, setParams] = useSearchParams()
  const canSeeAll = role >= ROLE_ADMIN
  const scope: LogScope = canSeeAll ? chosen : 'self'

  return {
    scope,
    canSeeAll,
    admin: scope === 'all',
    root: scope === 'all' && role >= ROLE_ROOT,
    choose: (next: LogScope) => {
      setChosen(next)
      setParams((current) => {
        const params = new URLSearchParams(current)
        params.delete('page')
        return params
      })
    },
  }
}

/** A page past the end (fewer results after new filters) goes back to the first page. */
export function useEmptyPageReset(page: number, setPage: (page: number) => void, loaded: boolean, empty: boolean) {
  useEffect(() => {
    if (page > 1 && loaded && empty) setPage(1)
  }, [page, setPage, loaded, empty])
}
