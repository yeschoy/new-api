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
import { flowPath, nodeOf, rowMetrics, type FlowKind, type FlowLabels, type FlowMetric, type Metrics, type PathNode } from './flow-paths'

export type FlowRole = 'user' | 'admin' | 'root'
export type Overflow = 'aggregate' | 'hide'
export type NodeRef = { kind: FlowKind; id: string }
export type LinkRef = { source: string; target: string }

/** The columns each role's rows can fill (model/usedata_flow.go returns more fields the higher the role). */
export const ROLE_STAGES: Record<FlowRole, FlowKind[]> = {
  root: ['user', 'node', 'token', 'group', 'model', 'channel'],
  admin: ['user', 'group', 'model', 'channel'],
  user: ['token', 'group', 'model'],
}

/** Names that can identify people, keys or infrastructure; model names are public. */
const SENSITIVE: ReadonlySet<FlowKind> = new Set(['user', 'node', 'token', 'group', 'channel'])
export const MASK = '••••'

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
export type FlowOption = NodeRef & { label: string; value: number }

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

export function visibleStages(role: FlowRole, shown: FlowKind[]): FlowKind[] {
  const stages = ROLE_STAGES[role]
  const visible = stages.filter((stage) => shown.includes(stage))
  return visible.length >= 2 ? visible : stages
}

const linkKey = (source: string, target: string) => `${source}\u0000${target}`

function metricOf(metrics: Metrics, metric: FlowMetric): number {
  return metrics[metric]
}

function matchesFilters(path: PathNode[], selected: NodeRef[]): boolean {
  const kinds = new Set(selected.map((item) => item.kind))
  for (const kind of kinds) {
    const ids = new Set(selected.filter((item) => item.kind === kind).map((item) => item.id))
    if (!path.some((node) => node.kind === kind && ids.has(node.id))) return false
  }
  return true
}

function filterByNodes(rows: FlowRow[], selected: NodeRef[], stages: FlowKind[], labels: FlowLabels): FlowRow[] {
  const relevant = selected.filter((item) => stages.includes(item.kind))
  if (relevant.length === 0) return rows
  return rows.filter((row) => matchesFilters(flowPath(row, stages, labels), relevant))
}

/** Per column, the ids of the `limit` largest nodes by the metric. */
function topNodes(rows: FlowRow[], stages: FlowKind[], settings: FlowSettings): Map<FlowKind, Set<string>> {
  const totals = new Map<FlowKind, Map<string, { label: string; value: number }>>()
  for (const row of rows) {
    const value = metricOf(rowMetrics(row), settings.metric)
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

/** Builds the flow graph, its totals and the filter options from the rows of /api/data/flow. */
export function buildFlow(rows: FlowRow[], settings: FlowSettings): FlowData {
  const stages = visibleStages(settings.role, settings.stages)
  const users = new Set(settings.selectedUsers)
  const userRows = users.size ? rows.filter((row) => users.has(nodeOf(row, 'user', settings.labels).id)) : rows
  const filtered = filterByNodes(userRows, settings.selectedNodes, stages, settings.labels)
  const tops = topNodes(filtered, stages, settings)

  const summary: Metrics = { quota: 0, tokens: 0, requests: 0 }
  const paths: Array<{ path: PathNode[]; metrics: Metrics }> = []
  for (const row of filtered) {
    const metrics = rowMetrics(row)
    summary.quota += metrics.quota
    summary.tokens += metrics.tokens
    summary.requests += metrics.requests
    const path = flowPath(row, stages, settings.labels)
    const overflowing = path.some((node) => !tops.get(node.kind)?.has(node.id))
    if (overflowing && settings.overflow === 'hide') continue
    paths.push({
      metrics,
      path: path.map((node) => (tops.get(node.kind)?.has(node.id) ? node : { kind: node.kind, id: `${node.kind}:\u0000other`, label: settings.labels.other(node.kind) })),
    })
  }

  const nodes = new Map<string, FlowNode>()
  const links = new Map<string, FlowLink>()
  let total = 0
  for (const { path, metrics } of paths) {
    const value = metricOf(metrics, settings.metric)
    total += value
    path.forEach((step, index) => {
      const node = nodes.get(step.id) ?? { ...step, value: 0, quota: 0, tokens: 0, requests: 0, other: step.id.endsWith('\u0000other') }
      node.value += value
      node.quota += metrics.quota
      node.tokens += metrics.tokens
      node.requests += metrics.requests
      nodes.set(step.id, node)
      const next = path[index + 1]
      if (!next) return
      const key = linkKey(step.id, next.id)
      const link = links.get(key) ?? { source: step.id, target: next.id, value: 0, quota: 0, tokens: 0, requests: 0, share: 0, sourceLabel: step.label, targetLabel: next.label }
      link.value += value
      link.quota += metrics.quota
      link.tokens += metrics.tokens
      link.requests += metrics.requests
      links.set(key, link)
    })
  }
  for (const link of links.values()) link.share = total > 0 ? link.value / total : 0

  highlight(paths, nodes, links, settings, stages)
  if (settings.mask) mask(nodes, links)
  const hide = (options: FlowOption[]) => (settings.mask ? options.map((option) => (SENSITIVE.has(option.kind) ? { ...option, label: MASK } : option)) : options)

  return {
    stages,
    summary,
    nodes: [...nodes.values()].filter((node) => node.value > 0),
    links: [...links.values()].filter((link) => link.value > 0),
    userOptions: hide(userOptions(rows, settings)),
    nodeOptions: hide(nodeOptions(userRows, stages, settings)),
  }
}

/** A clicked node or link keeps the paths through it bright and dims the rest. */
function highlight(paths: Array<{ path: PathNode[] }>, nodes: Map<string, FlowNode>, links: Map<string, FlowLink>, settings: FlowSettings, stages: FlowKind[]) {
  const link = settings.activeLink
  const active = settings.active && stages.includes(settings.active.kind) ? settings.active : null
  if (!link && !active) return
  const litNodes = new Set<string>()
  const litLinks = new Set<string>()
  for (const { path } of paths) {
    const through = link
      ? path.some((node, index) => node.id === link.source && path[index + 1]?.id === link.target)
      : path.some((node) => node.kind === active?.kind && node.id === active.id)
    if (!through) continue
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

function userOptions(rows: FlowRow[], settings: FlowSettings): FlowOption[] {
  const totals = new Map<string, FlowOption>()
  for (const row of rows) {
    if (!row.user_id && !row.username) continue
    const node = nodeOf(row, 'user', settings.labels)
    const option = totals.get(node.id) ?? { kind: 'user', id: node.id, label: node.label, value: 0 }
    option.value += metricOf(rowMetrics(row), settings.metric)
    totals.set(node.id, option)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function nodeOptions(rows: FlowRow[], stages: FlowKind[], settings: FlowSettings): FlowOption[] {
  const options: FlowOption[] = []
  for (const stage of stages) {
    // A column's choices follow the other columns' filters, not its own.
    const candidates = filterByNodes(rows, settings.selectedNodes.filter((item) => item.kind !== stage), stages, settings.labels)
    const totals = new Map<string, FlowOption>()
    for (const row of candidates) {
      const node = nodeOf(row, stage, settings.labels)
      const option = totals.get(node.id) ?? { kind: stage, id: node.id, label: node.label, value: 0 }
      option.value += metricOf(rowMetrics(row), settings.metric)
      totals.set(node.id, option)
    }
    options.push(...[...totals.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)))
  }
  return options
}
