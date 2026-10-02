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
import { tk } from '@/i18n/i18n'

/** A time window in epoch milliseconds; null leaves that side open. */
export type TimeRange = { start: number | null; end: number | null }

function startOfDay(date: Date, offsetDays = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays)
}

function endOfDay(date: Date, offsetDays = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays, 23, 59, 59, 999)
}

/** What the log pages show until a range is picked: today since midnight, up to an hour from now. */
export function defaultRange(now: Date): { start: number; end: number } {
  return { start: startOfDay(now).getTime(), end: now.getTime() + 3_600_000 }
}

export type RangePreset = 'today' | '7d' | 'week' | '30d' | 'month'

export const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 'today', label: tk('今天') },
  { id: '7d', label: tk('近 {days} 天') },
  { id: 'week', label: tk('本周') },
  { id: '30d', label: tk('近 {days} 天') },
  { id: 'month', label: tk('本月') },
]

/** Days covered by the "last N days" presets. */
export const PRESET_DAYS: Partial<Record<RangePreset, number>> = { '7d': 7, '30d': 30 }

export function presetRange(preset: RangePreset, now: Date): { start: number; end: number } {
  const end = endOfDay(now).getTime()
  if (preset === '7d') return { start: startOfDay(now, -6).getTime(), end }
  if (preset === '30d') return { start: startOfDay(now, -29).getTime(), end }
  if (preset === 'week') {
    const fromMonday = (now.getDay() + 6) % 7
    return { start: startOfDay(now, -fromMonday).getTime(), end: endOfDay(now, 6 - fromMonday).getTime() }
  }
  if (preset === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
    }
  }
  return { start: startOfDay(now).getTime(), end }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Epoch ms → the local "YYYY-MM-DDTHH:mm" a datetime-local input takes. */
export function toInputValue(ms: number | null): string {
  if (ms === null) return ''
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromInputValue(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function stamp(ms: number | null, now: Date): string {
  if (ms === null) return '—'
  const date = new Date(ms)
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return date.getFullYear() === now.getFullYear() ? day : `${date.getFullYear()}-${day}`
}

/** "10-02 00:00 ~ 10-02 23:59"; the year shows only outside the current one. */
export function rangeLabel(start: number | null, end: number | null, now: Date): string {
  return `${stamp(start, now)} ~ ${stamp(end, now)}`
}
