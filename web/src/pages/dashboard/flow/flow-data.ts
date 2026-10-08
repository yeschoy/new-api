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
import { filterByNodes, maskOptions, nodeOptions, userOptions } from './flow-options'
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
  type Metrics,
  type NodeRef,
  type PathNode,
} from './flow-paths'

export type { FlowOption, NodeRef } from './flow-paths'

export type FlowRole = 'user' | 'admin' | 'root'
export type Overflow = 'aggregate' | 'hide'
export type LinkRef = { source: string; target: string }

/** The columns each role's rows can fill (model/usedata_flow.go returns more fields the higher the role). */
export const ROLE_STAGES: Record<FlowRole, FlowKind[]> = {
  root: ['user', 'node', 'token', 'group', 'model', 'channel'],
  admin: ['user', 'group', 'model', 'channel'],
  user: ['token', 'group', 'model'],
}

export type FlowNode = PathNode & Metrics & { value: number; other: boolean; highlighted?: boolean; dimmed?: boolean }
export type FlowLink = Metrics & {
  source: string
  target: string
  value: number
  share: number
  sourceLabel: string
  targetLabel: string
  highlighted?: boolean
  dimmed?: boolean
}

export type FlowSettings = {
  role: FlowRole
  metric: FlowMetric
  /** Shown columns; fewer than two shows all of the role's. */
  stages: FlowKind[]
  selectedUsers: string[]
  selectedNodes: NodeRef[]
  /** Nodes kept per column; the rest is merged into "other" or left out. */
  limit: number
  overflow: Overflow
  active: NodeRef | null
  activeLink: LinkRef | null
  mask: boolean
  labels: FlowLabels
}

export type FlowData = {
  stages: FlowKind[]
  summary: Metrics
  nodes: FlowNode[]
  links: FlowLink[]
  /** Users to filter by (all rows), and the nodes of every column (respecting the other columns' filters). */
  userOptions: FlowOption[]
  nodeOptions: FlowOption[]
}

type Path = { path: PathNode[]; metrics: Metrics }

const OTHER = '\u0000other'
const linkKey = (source: string, target: string) => `${source}\u0000${target}`

export function visibleStages(role: FlowRole, shown: FlowKind[]): FlowKind[] {
  const stages = ROLE_STAGES[role]
  const visible = stages.filter((stage) => shown.includes(stage))
  return visible.length >= 2 ? visible : stages
}

/** Per column, the ids of the `limit` largest nodes by the metric. */
function topNodes(rows: FlowRow[], stages: FlowKind[], settings: FlowSettings): Map<FlowKind, Set<string>> {
  const totals = new Map<FlowKind, Map<string, { label: string; value: number }>>()
  for (const row of rows) {
    const value = rowMetrics(row)[settings.metric]
    for (const node of flowPath(row, stages, settings.labels)) {
      const column = totals.get(node.kind) ?? new Map()
      const current = column.get(node.id) ?? { label: node.label, value: 0 }
      current.value += value
      column.set(node.id, current)
      totals.set(node.kind, column)
    }
  }
  const tops = new Map<FlowKind, Set<string>>()
  for (const [kind, column] of totals) {
    const ids = [...column.entries()]
      .sort((a, b) => b[1].value - a[1].value || a[1].label.localeCompare(b[1].label) || a[0].localeCompare(b[0]))
      .slice(0, settings.limit)
      .map(([id]) => id)
    tops.set(kind, new Set(ids))
  }
  return tops
}

/** Each row's path, with nodes past the limit merged into their column's "other" node, or the row left out. */
function limitedPaths(rows: FlowRow[], stages: FlowKind[], settings: FlowSettings): Path[] {
  const tops = topNodes(rows, stages, settings)
  const kept = (node: PathNode) => tops.get(node.kind)?.has(node.id) === true
  const paths: Path[] = []
  for (const row of rows) {
    const path = flowPath(row, stages, settings.labels)
    if (settings.overflow === 'hide' && !path.every(kept)) continue
    paths.push({
      metrics: rowMetrics(row),
      path: path.map((node) => {
        if (kept(node)) return node
        return { kind: node.kind, id: `${node.kind}:${OTHER}`, label: settings.labels.other(node.kind) }
      }),
    })
  }
  return paths
}

function add(target: Metrics & { value: number }, metrics: Metrics, value: number) {
  target.value += value
  target.quota += metrics.quota
  target.tokens += metrics.tokens
  target.requests += metrics.requests
}

/** Sums the paths into nodes and links; each link's share is of all that flows. */
function accumulate(paths: Path[], metric: FlowMetric) {
  const nodes = new Map<string, FlowNode>()
  const links = new Map<string, FlowLink>()
  let total = 0
  for (const { path, metrics } of paths) {
    const value = metrics[metric]
    total += value
    path.forEach((step, index) => {
      const node = nodes.get(step.id) ?? { ...step, value: 0, quota: 0, tokens: 0, requests: 0, other: step.id.endsWith(OTHER) }
      add(node, metrics, value)
      nodes.set(step.id, node)
      const next = path[index + 1]
      if (!next) return
      const key = linkKey(step.id, next.id)
      const link = links.get(key) ?? { source: step.id, target: next.id, value: 0, quota: 0, tokens: 0, requests: 0, share: 0, sourceLabel: step.label, targetLabel: next.label }
      add(link, metrics, value)
      links.set(key, link)
    })
  }
  for (const link of links.values()) link.share = total > 0 ? link.value / total : 0
  return { nodes, links }
}

/** Builds the flow graph, its totals and the filter options from the rows of /api/data/flow. */
export function buildFlow(rows: FlowRow[], settings: FlowSettings): FlowData {
  const stages = visibleStages(settings.role, settings.stages)
  const users = new Set(settings.selectedUsers)
  const userRows = users.size ? rows.filter((row) => users.has(nodeOf(row, 'user', settings.labels).id)) : rows
  const filtered = filterByNodes(userRows, settings.selectedNodes, stages, settings.labels)
  const summary = { quota: 0, tokens: 0, requests: 0, value: 0 }
  for (const row of filtered) add(summary, rowMetrics(row), 0)

  const paths = limitedPaths(filtered, stages, settings)
  const graph = accumulate(paths, settings.metric)
  highlight(paths, graph.nodes, graph.links, settings, stages)
  if (settings.mask) mask(graph.nodes, graph.links)
  const userChoices = userOptions(rows, settings.metric, settings.labels)
  const nodeChoices = nodeOptions(userRows, stages, settings.selectedNodes, settings.metric, settings.labels)

  return {
    stages,
    summary: { quota: summary.quota, tokens: summary.tokens, requests: summary.requests },
    nodes: [...graph.nodes.values()].filter((node) => node.value > 0),
    links: [...graph.links.values()].filter((link) => link.value > 0),
    userOptions: settings.mask ? maskOptions(userChoices) : userChoices,
    nodeOptions: settings.mask ? maskOptions(nodeChoices) : nodeChoices,
  }
}

/** A picked node or link keeps the paths through it bright and dims the rest. */
function highlight(paths: Path[], nodes: Map<string, FlowNode>, links: Map<string, FlowLink>, settings: FlowSettings, stages: FlowKind[]) {
  const link = settings.activeLink
  const active = settings.active && stages.includes(settings.active.kind) ? settings.active : null
  if (!link && !active) return
  const through = (path: PathNode[]) => {
    if (link) return path.some((node, index) => node.id === link.source && path[index + 1]?.id === link.target)
    return path.some((node) => node.kind === active?.kind && node.id === active.id)
  }
  const litNodes = new Set<string>()
  const litLinks = new Set<string>()
  for (const { path } of paths) {
    if (!through(path)) continue
    path.forEach((node, index) => {
      litNodes.add(node.id)
      if (path[index + 1]) litLinks.add(linkKey(node.id, path[index + 1].id))
    })
  }
  if (litNodes.size === 0) return
  for (const node of nodes.values()) {
    node.highlighted = litNodes.has(node.id)
    node.dimmed = !node.highlighted
  }
  for (const item of links.values()) {
    item.highlighted = litLinks.has(linkKey(item.source, item.target))
    item.dimmed = !item.highlighted
  }
}

/** Replaces private names with dots; ids stay, so the shape of the flow does not change. */
function mask(nodes: Map<string, FlowNode>, links: Map<string, FlowLink>) {
  const masked = new Set<string>()
  for (const node of nodes.values()) {
    if (!SENSITIVE.has(node.kind) || node.other) continue
    node.label = MASK
    masked.add(node.id)
  }
  for (const link of links.values()) {
    if (masked.has(link.source)) link.sourceLabel = MASK
    if (masked.has(link.target)) link.targetLabel = MASK
  }
}
