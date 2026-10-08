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

export type FlowKind = 'user' | 'node' | 'token' | 'group' | 'model' | 'channel'
export type FlowMetric = 'quota' | 'tokens' | 'requests'
export type Metrics = Record<FlowMetric, number>

/** One step of a request's path: the node it passes in one column. */
export type PathNode = { kind: FlowKind; id: string; label: string }

export type NodeRef = { kind: FlowKind; id: string }

/** A user or node to filter by, with its total in the width metric. */
export type FlowOption = NodeRef & { label: string; value: number }

/** Names that can identify people, keys or infrastructure; model names are public. */
export const SENSITIVE: ReadonlySet<FlowKind> = new Set(['user', 'node', 'token', 'group', 'channel'])
export const MASK = '••••'

/** Names the page supplies in its language. */
export type FlowLabels = {
  deletedToken: (id: number) => string
  unknown: string
  other: (kind: FlowKind) => string
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function rowMetrics(row: FlowRow): Metrics {
  return { quota: num(row.quota), tokens: num(row.token_used), requests: num(row.count) }
}

/** Ids prefer the numeric ids the server sends, so renamed users, keys and channels stay one node. */
const BUILDERS: Record<FlowKind, (row: FlowRow, labels: FlowLabels) => Omit<PathNode, 'kind'>> = {
  user: (row, labels) => {
    const id = num(row.user_id)
    return { id: id > 0 ? `user:${id}` : `user:${row.username || 'unknown'}`, label: row.username || (id > 0 ? `user-${id}` : labels.unknown) }
  },
  node: (row) => {
    const name = row.node_name || 'default-node'
    return { id: `node:${name}`, label: name }
  },
  // A deleted key comes back without a name; it keeps its id under a "deleted" label.
  token: (row, labels) => {
    const id = num(row.token_id)
    return { id: id > 0 ? `token:${id}` : `token:${row.token_name || 'unknown'}`, label: row.token_name || (id > 0 ? labels.deletedToken(id) : labels.unknown) }
  },
  group: (row, labels) => ({ id: `group:${row.use_group || 'unknown'}`, label: row.use_group || labels.unknown }),
  model: (row, labels) => ({ id: `model:${row.model_name || 'unknown'}`, label: row.model_name || labels.unknown }),
  channel: (row, labels) => {
    const id = num(row.channel_id)
    return { id: id > 0 ? `channel:${id}` : `channel:${row.channel_name || 'unknown'}`, label: row.channel_name || (id > 0 ? `channel-${id}` : labels.unknown) }
  },
}

export function nodeOf(row: FlowRow, kind: FlowKind, labels: FlowLabels): PathNode {
  return { kind, ...BUILDERS[kind](row, labels) }
}

/** The row's node in each shown column, left to right. */
export function flowPath(row: FlowRow, stages: FlowKind[], labels: FlowLabels): PathNode[] {
  return stages.map((kind) => nodeOf(row, kind, labels))
}
