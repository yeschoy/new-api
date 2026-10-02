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
import { niceTicks } from '../charts/chart-scale'
import { bucketStart, windowBuckets } from '../dashboard-time'
import { breakdown, lines, ranked } from '../usage/usage-data'

// Local times, so the expectations hold in any time zone the tests run in.
const at = (text: string) => new Date(text).getTime() / 1000

describe('time buckets', () => {
  it('starts a week on the Monday before', () => {
    // 2026-10-01 is a Thursday.
    expect(bucketStart(at('2026-10-01T15:20'), 'week')).toBe(at('2026-09-28T00:00'))
  })

  it('starts a day at local midnight', () => {
    expect(bucketStart(at('2026-10-01T15:20'), 'day')).toBe(at('2026-10-01T00:00'))
  })

  it('lists every hour of a window, quiet ones included', () => {
    const buckets = windowBuckets({ start: at('2026-10-01T10:00'), end: at('2026-10-01T13:10') }, 'hour')
    expect(buckets).toHaveLength(4)
  })

  it('gives up on a window with more buckets than the limit', () => {
    expect(windowBuckets({ start: at('2026-09-01T00:00'), end: at('2026-10-01T00:00') }, 'hour', 500)).toBeNull()
  })
})

describe('chart axis', () => {
  it('steps to round values above the peak', () => {
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10])
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500])
  })

  it('still draws an axis without data', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('usage breakdown', () => {
  const window = { start: at('2026-10-01T00:00'), end: at('2026-10-01T23:59') }
  const rows = [
    { model_name: 'a', created_at: at('2026-10-01T01:00'), count: 1, quota: 100, token_used: 10 },
    { model_name: 'b', created_at: at('2026-10-01T01:00'), count: 5, quota: 300, token_used: 50 },
    { model_name: 'c', created_at: at('2026-10-01T05:00'), count: 2, quota: 200, token_used: 20 },
    { model_name: 'a', created_at: at('2026-10-01T05:00'), count: 3, quota: 50, token_used: 30 },
  ]
  const data = breakdown(rows, window, 'day', (row) => row.model_name ?? '')

  it('puts the day in one bucket per model', () => {
    expect(data.buckets).toEqual([at('2026-10-01T00:00')])
    expect(data.entities.find((entity) => entity.name === 'a')?.values.requests).toEqual([4])
  })

  it('ranks by the chosen metric and sums the rest as other', () => {
    expect(ranked(data.entities, 'quota', 2, 'other')).toEqual([
      { name: 'b', value: 300 },
      { name: 'c', value: 200 },
      { name: 'other', value: 150, other: true },
    ])
  })

  it('leaves the rest out when no other label is given', () => {
    expect(ranked(data.entities, 'requests', 1)).toEqual([{ name: 'b', value: 5 }])
  })

  it('adds the remaining series up per bucket as other', () => {
    const hourly = breakdown(rows, window, 'hour', (row) => row.model_name ?? '')
    const series = lines(hourly, 'requests', 1, 'other')
    expect(series.map((line) => line.name)).toEqual(['b', 'other'])
    expect(series[1].values[1]).toBe(1)
    expect(series[1].values[5]).toBe(5)
    expect(series[1].total).toBe(6)
  })
})
