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

import { OTHER_COLOR, SERIES_LIMIT, colorAt } from '../charts/chart-scale'
import type { TimeSeries } from '../charts/time-chart'
import { lines, ranked, type Breakdown, type Metric } from './usage-data'

/** Key of the "other" entry, which no model or user name can take. */
export const OTHER_KEY = '\u0000other'

export type NamedSeries = TimeSeries & { total: number }

/** Time series of the biggest entities by `metric`, coloured in order; with `otherLabel` the rest is one more series. */
export function namedSeries(data: Breakdown, metric: Metric, limit = SERIES_LIMIT, otherLabel?: string): NamedSeries[] {
  return lines(data, metric, limit, otherLabel).map((line, index) => ({
    key: line.other ? OTHER_KEY : line.name,
    label: line.name,
    color: line.other ? OTHER_COLOR : colorAt(index),
    values: line.values,
    total: line.total,
  }))
}

/** The same entities as named, coloured entries for shares and rankings. */
export function namedShares(data: Breakdown, metric: Metric, limit: number, otherLabel?: string) {
  return ranked(data.entities, metric, limit, otherLabel).map((item, index) => ({
    key: item.other ? OTHER_KEY : item.name,
    label: item.name,
    value: item.value,
    other: item.other,
    color: item.other ? OTHER_COLOR : colorAt(index),
  }))
}

/** Picks one series to show alone; a pick that is no longer in the data shows all again. */
export function useIsolation(series: NamedSeries[]) {
  const [only, setOnly] = useState<string | null>(null)
  const selected = series.some((item) => item.key === only) ? only : null
  return { selected, setOnly, shown: selected === null ? series : series.filter((item) => item.key === selected) }
}
