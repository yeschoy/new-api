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
export { clsx as cn } from 'clsx'

/** 1234 → 1.2K, 5_300_000 → 5.3M, 2_200_000_000_000 → 2.2T */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const units: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size
      const digits = scaled >= 100 ? 0 : 1
      return `${scaled.toFixed(digits).replace(/\.0$/, '')}${suffix}`
    }
  }
  return String(Math.round(value))
}

/** 128000 → "128K", 1000000 → "1M" (context windows). */
export function contextLabel(tokens?: number): string | null {
  if (!tokens) return null
  return compactNumber(tokens)
}

/** "2026-09-23" → "Sep 23, 2026" in the active locale. */
export function shortDate(value?: string | number, locale = 'en-US'): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function dateTime(seconds: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
}
