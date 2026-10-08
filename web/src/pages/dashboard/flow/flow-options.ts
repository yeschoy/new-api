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
import type { FlowRow } from '../dashboard-api'
import {
  MASK,
  SENSITIVE,
  flowPath,
  nodeOf,
  rowMetrics,
  type FlowKind,
  type FlowLabels,
  type FlowMetric,
  type FlowOption,
  type NodeRef,
  type PathNode,
} from './flow-paths'

/** Within a column any picked node passes; across columns every column with picks must pass. */
function matchesFilters(path: PathNode[], selected: NodeRef[]): boolean {
  const kinds = new Set(selected.map((item) => item.kind))
  for (const kind of kinds) {
    const ids = new Set(selected.filter((item) => item.kind === kind).map((item) => item.id))
    if (!path.some((node) => node.kind === kind && ids.has(node.id))) return false
  }
  return true
}

/** Rows whose path passes the picked nodes of the shown columns. */
export function filterByNodes(rows: FlowRow[], selected: NodeRef[], stages: FlowKind[], labels: FlowLabels): FlowRow[] {
  const relevant = selected.filter((item) => stages.includes(item.kind))
  if (relevant.length === 0) return rows
  return rows.filter((row) => matchesFilters(flowPath(row, stages, labels), relevant))
}

function byValue(a: FlowOption, b: FlowOption): number {
  return b.value - a.value || a.label.localeCompare(b.label)
}

/** Every user in the rows, biggest first. */
export function userOptions(rows: FlowRow[], metric: FlowMetric, labels: FlowLabels): FlowOption[] {
  const totals = new Map<string, FlowOption>()
  for (const row of rows) {
    if (!row.user_id && !row.username) continue
    const node = nodeOf(row, 'user', labels)
    const option = totals.get(node.id) ?? { kind: 'user', id: node.id, label: node.label, value: 0 }
    option.value += rowMetrics(row)[metric]
    totals.set(node.id, option)
  }
  return [...totals.values()].sort(byValue)
}

/** Each column's nodes, biggest first; a column's choices follow the other columns' filters, not its own. */
export function nodeOptions(rows: FlowRow[], stages: FlowKind[], selected: NodeRef[], metric: FlowMetric, labels: FlowLabels): FlowOption[] {
  const options: FlowOption[] = []
  for (const stage of stages) {
    const candidates = filterByNodes(
      rows,
      selected.filter((item) => item.kind !== stage),
      stages,
      labels
    )
    const totals = new Map<string, FlowOption>()
    for (const row of candidates) {
      const node = nodeOf(row, stage, labels)
      const option = totals.get(node.id) ?? { kind: stage, id: node.id, label: node.label, value: 0 }
      option.value += rowMetrics(row)[metric]
      totals.set(node.id, option)
    }
    options.push(...[...totals.values()].sort(byValue))
  }
  return options
}

/** Private names as dots, as on the chart. */
export function maskOptions(options: FlowOption[]): FlowOption[] {
  return options.map((option) => {
    if (!SENSITIVE.has(option.kind)) return option
    return { ...option, label: MASK }
  })
}
