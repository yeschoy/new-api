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
import { defaultRange, fromInputValue, presetRange, rangeLabel, toInputValue } from '../time-range'

// Thursday 2 October 2026, 09:30 local time.
const NOW = new Date(2026, 9, 2, 9, 30, 15)

describe('defaultRange', () => {
  it('starts at midnight today and ends an hour from now', () => {
    expect(defaultRange(NOW)).toEqual({
      start: new Date(2026, 9, 2, 0, 0, 0).getTime(),
      end: new Date(2026, 9, 2, 10, 30, 15).getTime(),
    })
  })
})

describe('presetRange', () => {
  it('covers today', () => {
    expect(presetRange('today', NOW)).toEqual({
      start: new Date(2026, 9, 2, 0, 0, 0).getTime(),
      end: new Date(2026, 9, 2, 23, 59, 59, 999).getTime(),
    })
  })

  it('covers the last 7 days including today', () => {
    expect(presetRange('7d', NOW).start).toBe(new Date(2026, 8, 26, 0, 0, 0).getTime())
  })

  it('starts the week on Monday', () => {
    expect(presetRange('week', NOW)).toEqual({
      start: new Date(2026, 8, 28, 0, 0, 0).getTime(),
      end: new Date(2026, 9, 4, 23, 59, 59, 999).getTime(),
    })
  })

  it('covers the whole month', () => {
    expect(presetRange('month', NOW)).toEqual({
      start: new Date(2026, 9, 1, 0, 0, 0).getTime(),
      end: new Date(2026, 9, 31, 23, 59, 59, 999).getTime(),
    })
  })
})

describe('datetime-local values', () => {
  it('round-trips a local time to the minute', () => {
    const value = toInputValue(new Date(2026, 9, 2, 9, 5).getTime())
    expect(value).toBe('2026-10-02T09:05')
    expect(fromInputValue(value)).toBe(new Date(2026, 9, 2, 9, 5).getTime())
  })

  it('reads an empty or broken value as no bound', () => {
    expect(fromInputValue('')).toBeNull()
    expect(fromInputValue('nope')).toBeNull()
    expect(toInputValue(null)).toBe('')
  })
})

describe('rangeLabel', () => {
  it('drops the year inside the current year', () => {
    const range = presetRange('today', NOW)
    expect(rangeLabel(range.start, range.end, NOW)).toBe('10-02 00:00 ~ 10-02 23:59')
  })

  it('keeps the year for other years and marks open ends', () => {
    expect(rangeLabel(new Date(2025, 0, 3, 8, 0).getTime(), null, NOW)).toBe('2025-01-03 08:00 ~ —')
  })
})
