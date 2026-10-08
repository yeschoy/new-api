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

import { RANGE_DAYS, daysFor, isGranularity, type Granularity } from '../dashboard-time'

export type SpendChartKind = 'bar' | 'area'
export type CallsChartKind = 'trend' | 'proportion' | 'top'

/** The viewer's defaults, stored as the old dashboard stored them so earlier choices carry over. */
export type UsagePrefs = {
  consumptionDistributionChart: SpendChartKind
  modelAnalyticsChart: CallsChartKind
  defaultTimeRangeDays: number
  defaultTimeGranularity: Granularity
}

export const PREFS_KEY = 'dashboard_models_chart_preferences'

export const SPEND_CHARTS: Array<{ id: SpendChartKind; label: string }> = [
  { id: 'bar', label: tk('柱状图') },
  { id: 'area', label: tk('面积图') },
]

export const CALLS_CHARTS: Array<{ id: CallsChartKind; label: string }> = [
  { id: 'trend', label: tk('调用趋势') },
  { id: 'proportion', label: tk('调用占比') },
  { id: 'top', label: tk('调用排行') },
]

/** Without saved defaults: the operator's granularity (status.data_export_default_time) and its range. */
export function defaultPrefs(operatorGranularity?: string): UsagePrefs {
  const granularity = isGranularity(operatorGranularity) ? operatorGranularity : 'hour'
  return {
    consumptionDistributionChart: 'bar',
    modelAnalyticsChart: 'trend',
    defaultTimeRangeDays: daysFor(granularity),
    defaultTimeGranularity: granularity,
  }
}

function pick<T extends string>(value: unknown, allowed: Array<{ id: T }>, fallback: T): T {
  return allowed.some((item) => item.id === value) ? (value as T) : fallback
}

export function loadPrefs(operatorGranularity?: string): UsagePrefs {
  const fallback = defaultPrefs(operatorGranularity)
  let saved: Partial<UsagePrefs> | null = null
  try {
    saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<UsagePrefs> | null
  } catch {
    saved = null
  }
  if (!saved || typeof saved !== 'object') return fallback
  return {
    consumptionDistributionChart: pick(saved.consumptionDistributionChart, SPEND_CHARTS, fallback.consumptionDistributionChart),
    modelAnalyticsChart: pick(saved.modelAnalyticsChart, CALLS_CHARTS, fallback.modelAnalyticsChart),
    defaultTimeRangeDays: RANGE_DAYS.includes(Number(saved.defaultTimeRangeDays)) ? Number(saved.defaultTimeRangeDays) : fallback.defaultTimeRangeDays,
    defaultTimeGranularity: isGranularity(saved.defaultTimeGranularity) ? saved.defaultTimeGranularity : fallback.defaultTimeGranularity,
  }
}

export function savePrefs(prefs: UsagePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage may be unavailable; the defaults still apply for this visit.
  }
}
