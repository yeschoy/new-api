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
import type { QuotaRow, TimeWindow } from '../dashboard-api'
import { bucketStart, windowBuckets, type Granularity } from '../dashboard-time'

export type Metric = 'quota' | 'requests' | 'tokens'
export type Totals = Record<Metric, number>

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function rowMetrics(row: QuotaRow): Totals {
  return { quota: num(row.quota), requests: num(row.count), tokens: num(row.token_used) }
}

export function totalsOf(rows: QuotaRow[]): Totals {
  const totals: Totals = { quota: 0, requests: 0, tokens: 0 }
  for (const row of rows) {
    const metrics = rowMetrics(row)
    totals.quota += metrics.quota
    totals.requests += metrics.requests
    totals.tokens += metrics.tokens
  }
  return totals
}

/** One model (or user): its totals and its value in every bucket. */
export type Entity = { name: string; totals: Totals; values: Record<Metric, number[]> }

export type Breakdown = { buckets: number[]; entities: Entity[] }

/**
 * Splits hourly rows into time buckets and named entities. The window's
 * buckets are all present (quiet ones at zero) unless there are too many,
 * then only the buckets with data.
 */
export function breakdown(rows: QuotaRow[], window: TimeWindow, granularity: Granularity, nameOf: (row: QuotaRow) => string): Breakdown {
  const starts = new Set(windowBuckets(window, granularity) ?? [])
  for (const row of rows) starts.add(bucketStart(num(row.created_at), granularity))
  const buckets = [...starts].sort((a, b) => a - b)
  const position = new Map(buckets.map((start, index) => [start, index]))
  const entities = new Map<string, Entity>()
  const zeros = () => buckets.map(() => 0)

  for (const row of rows) {
    const name = nameOf(row)
    let entity = entities.get(name)
    if (!entity) {
      entity = { name, totals: { quota: 0, requests: 0, tokens: 0 }, values: { quota: zeros(), requests: zeros(), tokens: zeros() } }
      entities.set(name, entity)
    }
    const index = position.get(bucketStart(num(row.created_at), granularity)) ?? 0
    const metrics = rowMetrics(row)
    for (const metric of ['quota', 'requests', 'tokens'] as const) {
      entity.totals[metric] += metrics[metric]
      entity.values[metric][index] += metrics[metric]
    }
  }
  return { buckets, entities: [...entities.values()] }
}

function byMetric(entities: Entity[], metric: Metric): Entity[] {
  return entities.filter((entity) => entity.totals[metric] > 0).sort((a, b) => b.totals[metric] - a.totals[metric] || a.name.localeCompare(b.name))
}

export type Ranked = { name: string; value: number; other?: boolean }

/** Biggest first by `metric`; past `limit` the rest is summed into one entry when `otherLabel` is given. */
export function ranked(entities: Entity[], metric: Metric, limit: number, otherLabel?: string): Ranked[] {
  const sorted = byMetric(entities, metric)
  const top: Ranked[] = sorted.slice(0, limit).map((entity) => ({ name: entity.name, value: entity.totals[metric] }))
  const rest = sorted.slice(limit).reduce((sum, entity) => sum + entity.totals[metric], 0)
  if (otherLabel !== undefined && rest > 0) top.push({ name: otherLabel, value: rest, other: true })
  return top
}

export type Line = { name: string; values: number[]; total: number; other?: boolean }

/** Per-bucket series of the top `limit` entities by `metric`, the rest summed as "other" when labelled. */
export function lines(data: Breakdown, metric: Metric, limit: number, otherLabel?: string): Line[] {
  const sorted = byMetric(data.entities, metric)
  const top: Line[] = sorted.slice(0, limit).map((entity) => ({ name: entity.name, values: entity.values[metric], total: entity.totals[metric] }))
  const rest = sorted.slice(limit)
  if (otherLabel !== undefined && rest.length > 0) {
    const values = data.buckets.map((_, index) => rest.reduce((sum, entity) => sum + entity.values[metric][index], 0))
    top.push({ name: otherLabel, values, total: values.reduce((sum, value) => sum + value, 0), other: true })
  }
  return top
}
