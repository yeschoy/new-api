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

import { getLang, localeOf, t, type Lang } from '@/i18n/i18n'

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** A key unused for this long gets a hint that it may be safe to delete. */
export const STALE_SECONDS = 90 * 86_400

/** "3 天前", "in 2 hours", … for a unix time, in the current language. */
export function relativeTime(seconds: number, nowMs: number, lang: Lang = getLang()): string {
  const diff = seconds - nowMs / 1000
  const size = UNITS.find((unit) => Math.abs(diff) >= unit[1])
  if (!size) return t('刚刚')
  return new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' }).format(Math.round(diff / size[1]), size[0])
}

/** The current time, refreshed every minute so relative times stay right on an open page. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
