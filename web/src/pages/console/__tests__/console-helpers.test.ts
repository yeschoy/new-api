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
import type { UsageLog } from '@/lib/services'

import {
  amountToQuota,
  durationLabel,
  formatQuota,
  keyStatusLabel,
  pageCount,
  quotaToUsd,
  recentWindow,
  roleLabel,
  sumLogs,
  withKeyPrefix,
} from '../console-helpers'

const USD = { symbol: '$', rate: 1 }
const CNY = { symbol: '¥', rate: 7 }

describe('quota conversion', () => {
  it('uses 500000 units per USD when the operator value is missing', () => {
    expect(quotaToUsd(1_000_000)).toBe(2)
    expect(quotaToUsd(1_000_000, 0)).toBe(2)
    expect(quotaToUsd(undefined)).toBe(0)
  })

  it('honours a custom quota_per_unit', () => {
    expect(quotaToUsd(250, 1000)).toBe(0.25)
  })

  it('formats quota in the display currency', () => {
    expect(formatQuota(1_250_000, USD)).toBe('$2.5')
    expect(formatQuota(500_000, CNY)).toBe('¥7')
    expect(formatQuota(0, USD)).toBe('$0')
  })

  it('converts a typed amount back into quota units', () => {
    expect(amountToQuota(2.5, USD)).toBe(1_250_000)
    expect(amountToQuota(7, CNY)).toBe(500_000)
    expect(amountToQuota(-1, USD)).toBe(0)
    expect(amountToQuota(Number.NaN, USD)).toBe(0)
  })

  it('round-trips amount → quota → display', () => {
    expect(formatQuota(amountToQuota(12.34, USD, 1000), USD, 1000)).toBe('$12.34')
  })
})

describe('labels', () => {
  it('prefixes keys once', () => {
    expect(withKeyPrefix('abcd')).toBe('sk-abcd')
    expect(withKeyPrefix('sk-abcd')).toBe('sk-abcd')
    expect(withKeyPrefix('')).toBe('')
  })

  it('labels key status and roles', () => {
    expect(keyStatusLabel(1)).toBeNull()
    expect(keyStatusLabel(2)).toBe('已禁用')
    expect(keyStatusLabel(4)).toBe('已耗尽')
    expect(roleLabel(1)).toBe('普通用户')
    expect(roleLabel(10)).toBe('管理员')
    expect(roleLabel(100)).toBe('超级管理员')
  })

  it('formats durations and page counts', () => {
    expect(durationLabel(0)).toBe('0s')
    expect(durationLabel(75)).toBe('1m 15s')
    expect(pageCount(0, 20)).toBe(1)
    expect(pageCount(41, 20)).toBe(3)
  })
})

describe('usage aggregation', () => {
  it('sums spend, tokens and requests', () => {
    const log = (quota: number, prompt: number, completion: number) =>
      ({ quota, prompt_tokens: prompt, completion_tokens: completion }) as UsageLog
    expect(sumLogs([log(10, 100, 50), log(5, 1, 2)])).toEqual({ quota: 15, tokens: 153, requests: 2 })
    expect(sumLogs([])).toEqual({ quota: 0, tokens: 0, requests: 0 })
  })

  it('builds a local-calendar window of whole days', () => {
    const now = new Date(2026, 8, 24, 15, 30)
    const window = recentWindow(now, 7)
    expect(window.dates).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ])
    expect(window.start).toBe(new Date(2026, 8, 18).getTime() / 1000)
    expect(window.end).toBe(Math.floor(now.getTime() / 1000))
    expect(window.end - window.start).toBeLessThan(10 * 86400)
  })
})
