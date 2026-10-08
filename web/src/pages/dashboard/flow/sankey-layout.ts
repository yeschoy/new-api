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
import type { FlowLink, FlowNode } from './flow-data'
import type { FlowKind } from './flow-paths'

export type SankeyNode = FlowNode & { column: number; x: number; y: number; height: number; color: string }
export type SankeyLink = FlowLink & { thickness: number; path: string; color: string }
export type Sankey = { width: number; height: number; nodes: SankeyNode[]; links: SankeyLink[]; spacing: number }

export const NODE_WIDTH = 12
const GAP = 10
const MIN_NODE = 3
const ROW = 26
const MIN_HEIGHT = 320
const MAX_HEIGHT = 2400
const SIDE = 8

const center = (node: SankeyNode) => node.y + node.height / 2

function groupBy(links: FlowLink[], pick: (link: FlowLink) => string): Map<string, FlowLink[]> {
  const groups = new Map<string, FlowLink[]>()
  for (const link of links) {
    const list = groups.get(pick(link))
    if (list) list.push(link)
    else groups.set(pick(link), [link])
  }
  return groups
}

/** Biggest first, "other" last. */
function byValue(a: FlowNode, b: FlowNode): number {
  return Number(a.other) - Number(b.other) || b.value - a.value || a.label.localeCompare(b.label)
}

/**
 * Columns follow the stages; node heights follow their value on one scale
 * for all columns (every column carries the same total). The first column is
 * ordered by value; each later one by where its flows come from, which keeps
 * crossings down.
 */
export function layoutSankey(nodes: FlowNode[], links: FlowLink[], stages: FlowKind[], width: number, palette: string[], otherColor: string): Sankey {
  const columns: FlowNode[][] = stages.map((stage) => nodes.filter((node) => node.kind === stage))
  const tallest = Math.max(1, ...columns.map((column) => column.length))
  const base = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, tallest * ROW))
  const scale = Math.min(
    ...columns.map((column) => {
      const total = column.reduce((sum, node) => sum + node.value, 0)
      return total > 0 ? (base - (column.length - 1) * GAP) / total : Number.POSITIVE_INFINITY
    })
  )
  const ky = Number.isFinite(scale) ? scale : 0
  const sizeOf = (node: FlowNode) => Math.max(MIN_NODE, node.value * ky)
  const height = Math.max(base, ...columns.map((column) => column.reduce((sum, node) => sum + sizeOf(node), 0) + (column.length - 1) * GAP))
  const spacing = (width - SIDE * 2 - NODE_WIDTH) / Math.max(1, stages.length - 1)

  const placed = new Map<string, SankeyNode>()
  const incoming = groupBy(links, (link) => link.target)

  columns.forEach((column, index) => {
    const order = index === 0 ? [...column].sort(byValue) : orderByOrigin(column, incoming, placed)
    let y = (height - order.reduce((sum, node) => sum + sizeOf(node), 0) - (order.length - 1) * GAP) / 2
    order.forEach((node, position) => {
      const color = index === 0 ? firstColor(node, position, palette, otherColor) : inheritedColor(node, incoming, placed, palette, otherColor)
      placed.set(node.id, { ...node, column: index, x: SIDE + index * spacing, y, height: sizeOf(node), color })
      y += sizeOf(node) + GAP
    })
  })

  return { width, height, spacing, nodes: [...placed.values()], links: routeLinks(links, placed, ky) }
}

function orderByOrigin(column: FlowNode[], incoming: Map<string, FlowLink[]>, placed: Map<string, SankeyNode>): FlowNode[] {
  const weight = new Map<string, number>()
  for (const node of column) {
    let sum = 0
    let total = 0
    for (const link of incoming.get(node.id) ?? []) {
      const source = placed.get(link.source)
      if (!source) continue
      sum += center(source) * link.value
      total += link.value
    }
    weight.set(node.id, total > 0 ? sum / total : Number.POSITIVE_INFINITY)
  }
  return [...column].sort((a, b) => Number(a.other) - Number(b.other) || (weight.get(a.id) ?? 0) - (weight.get(b.id) ?? 0) || byValue(a, b))
}

function firstColor(node: FlowNode, position: number, palette: string[], otherColor: string): string {
  return node.other ? otherColor : palette[position % palette.length]
}

/** A node takes the colour of where most of its flow comes from. */
function inheritedColor(node: FlowNode, incoming: Map<string, FlowLink[]>, placed: Map<string, SankeyNode>, palette: string[], otherColor: string): string {
  if (node.other) return otherColor
  const main = [...(incoming.get(node.id) ?? [])].sort((a, b) => b.value - a.value)[0]
  return (main && placed.get(main.source)?.color) || palette[0]
}

/** Bands leave and enter each node in the order of the nodes at their other end. */
function routeLinks(links: FlowLink[], placed: Map<string, SankeyNode>, ky: number): SankeyLink[] {
  const routed = links.filter((link) => placed.has(link.source) && placed.has(link.target))
  const keyOf = (link: FlowLink) => `${link.source}\u0000${link.target}`
  const nodeAt = (id: string) => placed.get(id) as SankeyNode

  /** Stacks a node's bands top to bottom, centred when the node is taller than its bands (small values). */
  const stack = (bundles: Map<string, FlowLink[]>, end: (link: FlowLink) => string) => {
    const offsets = new Map<string, number>()
    for (const [id, bundle] of bundles) {
      const node = nodeAt(id)
      bundle.sort((a, b) => center(nodeAt(end(a))) - center(nodeAt(end(b))))
      let y = node.y + Math.max(0, node.height - bundle.reduce((sum, link) => sum + link.value * ky, 0)) / 2
      for (const link of bundle) {
        offsets.set(keyOf(link), y)
        y += link.value * ky
      }
    }
    return offsets
  }
  const out = stack(
    groupBy(routed, (link) => link.source),
    (link) => link.target
  )
  const into = stack(
    groupBy(routed, (link) => link.target),
    (link) => link.source
  )

  return routed.map((link) => {
    const source = nodeAt(link.source)
    const target = nodeAt(link.target)
    const thickness = Math.max(1, link.value * ky)
    const s0 = out.get(keyOf(link)) ?? source.y
    const t0 = into.get(keyOf(link)) ?? target.y
    const x0 = source.x + NODE_WIDTH
    const x1 = target.x
    const mid = (x0 + x1) / 2
    const path = `M${x0},${s0} C${mid},${s0} ${mid},${t0} ${x1},${t0} L${x1},${t0 + thickness} C${mid},${t0 + thickness} ${mid},${s0 + thickness} ${x0},${s0 + thickness} Z`
    return { ...link, thickness, path, color: source.color }
  })
}
