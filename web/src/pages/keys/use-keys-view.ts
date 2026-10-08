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
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { PAGE_SIZES } from './keys-footer'
import type { KeyQuery } from './keys-api'

/** What the list shows: the server query plus the status filter of the page. */
export type KeysView = KeyQuery & { status: string }

const STATUSES = ['1', '2', '3', '4']
const DEFAULTS: KeysView = { page: 1, size: 20, keyword: '', token: '', status: '' }
// The address names the old keys page used.
const PARAMS: Record<keyof KeysView, string> = { page: 'page', size: 'pageSize', keyword: 'filter', token: 'token', status: 'status' }

function whole(value: string | null, allowed: (number: number) => boolean, fallback: number): number {
  const number = Number(value)
  return value !== null && Number.isInteger(number) && allowed(number) ? number : fallback
}

/** Page, page size, search and status, kept in the address so a reload or a shared link shows the same keys. */
export function useKeysView(): [KeysView, (patch: Partial<KeysView>) => void] {
  const [params, setParams] = useSearchParams()
  const status = params.get(PARAMS.status) ?? ''
  const view: KeysView = {
    page: whole(params.get(PARAMS.page), (page) => page > 0, DEFAULTS.page),
    size: whole(params.get(PARAMS.size), (size) => PAGE_SIZES.includes(size), DEFAULTS.size),
    keyword: params.get(PARAMS.keyword) ?? DEFAULTS.keyword,
    token: params.get(PARAMS.token) ?? DEFAULTS.token,
    status: STATUSES.includes(status) ? status : DEFAULTS.status,
  }

  const update = useCallback(
    (patch: Partial<KeysView>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [field, value] of Object.entries(patch) as Array<[keyof KeysView, string | number]>) {
            if (value === DEFAULTS[field]) next.delete(PARAMS[field])
            else next.set(PARAMS[field], String(value))
          }
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )

  return [view, update]
}
