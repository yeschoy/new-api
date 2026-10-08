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
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { defaultRange, type TimeRange } from './time-range'

export const PAGE_SIZES = [20, 50, 100]

function numberParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export type LogSearch<K extends string> = {
  /** Applied filters, as in the address bar. */
  values: Record<K, string>
  start: number | null
  end: number | null
  page: number
  pageSize: number
  /** Changes whenever the applied filters change; key the filter form on it to reload its draft. */
  signature: string
  apply: (values: Record<K, string>, range: TimeRange) => void
  reset: () => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
}

/**
 * Log filters live in the address bar under the old site's names (page,
 * pageSize, startTime / endTime in ms, model, token, …), so old links still
 * open the same view. Without a time, the window is today since midnight.
 */
export function useLogSearch<K extends string>(keys: readonly K[]): LogSearch<K> {
  const [params, setParams] = useSearchParams()
  const [defaults, setDefaults] = useState(() => defaultRange(new Date()))
  const values = {} as Record<K, string>
  for (const key of keys) values[key] = params.get(key)?.trim() ?? ''
  const timed = params.has('startTime') || params.has('endTime')
  const start = timed ? numberParam(params.get('startTime')) : defaults.start
  const end = timed ? numberParam(params.get('endTime')) : defaults.end
  const page = Math.max(1, Math.floor(numberParam(params.get('page')) ?? 1))
  const size = numberParam(params.get('pageSize'))
  const pageSize = size !== null && PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0]
  const signature = [...keys.map((key) => values[key]), start ?? '', end ?? ''].join('\u001f')

  const withSize = (next: URLSearchParams) => {
    if (pageSize !== PAGE_SIZES[0]) next.set('pageSize', String(pageSize))
    return next
  }

  return {
    values,
    start,
    end,
    page,
    pageSize,
    signature,
    apply: (nextValues, range) => {
      const next = new URLSearchParams()
      for (const key of keys) {
        const value = nextValues[key]?.trim()
        if (value) next.set(key, value)
      }
      next.set('startTime', range.start === null ? '' : String(range.start))
      next.set('endTime', range.end === null ? '' : String(range.end))
      setParams(withSize(next))
    },
    reset: () => {
      setDefaults(defaultRange(new Date()))
      setParams(withSize(new URLSearchParams()))
    },
    setPage: (nextPage) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (nextPage > 1) next.set('page', String(nextPage))
        else next.delete('page')
        return next
      })
    },
    setPageSize: (nextSize) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        next.set('pageSize', String(nextSize))
        next.delete('page')
        return next
      })
    },
  }
}

/** Seconds for the APIs that count in seconds (usage and task logs). */
export function toSeconds(ms: number | null): number | undefined {
  return ms === null ? undefined : Math.floor(ms / 1000)
}
