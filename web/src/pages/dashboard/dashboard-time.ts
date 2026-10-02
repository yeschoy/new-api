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
import { getLang, localeOf, t, tk } from '@/i18n/i18n'

import type { TimeWindow } from './dashboard-api'

export type Granularity = 'hour' | 'day' | 'week'

export const GRANULARITIES: Array<{ id: Granularity; label: string }> = [
  { id: 'hour', label: tk('按小时') },
  { id: 'day', label: tk('按天') },
  { id: 'week', label: tk('按周') },
]

/** Quick ranges in days; 29 stays inside the one-month limit of /api/data/self. */
export const RANGE_DAYS = [1, 7, 14, 29]

export function rangeLabel(days: number): string {
  return days === 1 ? t('近 24 小时') : t('近 {days} 天', { days })
}

export function isGranularity(value: unknown): value is Granularity {
  return value === 'hour' || value === 'day' || value === 'week'
}

/** The range that goes with a granularity: a day by the hour, a week by the day, a month by the week. */
export function daysFor(granularity: Granularity): number {
  if (granularity === 'week') return 29
  if (granularity === 'day') return 7
  return 1
}

/** The granularity that suits a quick range. */
export function granularityFor(days: number): Granularity {
  if (days <= 1) return 'hour'
  if (days >= 29) return 'week'
  return 'day'
}

/** The last `days` days up to now, in whole seconds. */
export function rollingWindow(days: number, now = Date.now()): TimeWindow {
  const end = Math.floor(now / 1000)
  return { start: end - days * 86_400, end }
}

/** Start of the bucket holding `ts`: the hour (as the server stores it), the local day, or the local week from Monday. */
export function bucketStart(ts: number, granularity: Granularity): number {
  if (granularity === 'hour') return ts - (ts % 3600)
  const date = new Date(ts * 1000)
  date.setHours(0, 0, 0, 0)
  if (granularity === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return Math.floor(date.getTime() / 1000)
}

function nextBucket(start: number, granularity: Granularity): number {
  if (granularity === 'hour') return start + 3600
  const date = new Date(start * 1000)
  date.setDate(date.getDate() + (granularity === 'week' ? 7 : 1))
  return Math.floor(date.getTime() / 1000)
}

/** Every bucket of the window in order, so quiet periods show as gaps; null past `limit` buckets. */
export function windowBuckets(window: TimeWindow, granularity: Granularity, limit = 500): number[] | null {
  const buckets: number[] = []
  for (let start = bucketStart(window.start, granularity); start <= window.end; start = nextBucket(start, granularity)) {
    buckets.push(start)
    if (buckets.length > limit) return null
  }
  return buckets
}

function monthDay(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(localeOf(getLang()), { month: 'numeric', day: 'numeric' })
}

function hourOf(ts: number): string {
  return `${String(new Date(ts * 1000).getHours()).padStart(2, '0')}:00`
}

/** Full name of a bucket for tooltips: "9/30 14:00", "9/30", "9/29–10/5". */
export function bucketName(start: number, granularity: Granularity): string {
  if (granularity === 'hour') return `${monthDay(start)} ${hourOf(start)}`
  if (granularity === 'week') return `${monthDay(start)}–${monthDay(nextBucket(start, 'week') - 86_400)}`
  return monthDay(start)
}

/** Short axis label: the hour (the date at midnight), or the day the bucket starts. */
export function bucketTick(start: number, granularity: Granularity): string {
  if (granularity === 'hour' && new Date(start * 1000).getHours() !== 0) return hourOf(start)
  return monthDay(start)
}

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs, and back to seconds. */
export function toLocalInput(ts: number): string {
  const date = new Date(ts * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): number | null {
  const ms = new Date(value).getTime()
  return value && Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}
