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

import type { FlowData, FlowOption, LinkRef, NodeRef } from './flow-data'
import type { FlowKind } from './flow-paths'

const same = (a: NodeRef | null, b: NodeRef) => a !== null && a.kind === b.kind && a.id === b.id

/** Without its option (filtered away meanwhile), a pick is named after its id without the column prefix. */
function fallback(ref: NodeRef): FlowOption {
  return { ...ref, label: ref.id.slice(ref.id.indexOf(':') + 1), value: 0 }
}

/**
 * What the viewer picked on the flow: filters (users and nodes, which remove
 * other rows) and the highlight (one node or band, which only dims the rest).
 */
export function useFlowSelection() {
  const [users, setUsers] = useState<string[]>([])
  const [nodes, setNodes] = useState<NodeRef[]>([])
  const [active, setActive] = useState<NodeRef | null>(null)
  const [link, setLink] = useState<LinkRef | null>(null)

  return {
    users,
    nodes,
    active,
    link,
    toggle(ref: NodeRef) {
      if (ref.kind === 'user') setUsers(users.includes(ref.id) ? users.filter((id) => id !== ref.id) : [...users, ref.id])
      else setNodes(nodes.some((item) => same(item, ref)) ? nodes.filter((item) => !same(item, ref)) : [...nodes, ref])
    },
    clearFilters() {
      setUsers([])
      setNodes([])
    },
    /** Picking the highlighted node again clears the highlight. */
    pickNode(ref: NodeRef) {
      setLink(null)
      setActive(same(active, ref) ? null : ref)
    },
    pickLink(ref: LinkRef) {
      setActive(null)
      setLink(link && link.source === ref.source && link.target === ref.target ? null : ref)
    },
    clearHighlight() {
      setActive(null)
      setLink(null)
    },
    /** Columns were hidden: their filters and any band go, as the paths change shape. */
    dropStages(hidden: FlowKind[]) {
      setNodes(nodes.filter((item) => !hidden.includes(item.kind)))
      setLink(null)
      if (active && hidden.includes(active.kind)) setActive(null)
    },
    /** The picks as named options, users first. */
    chosen(flow: FlowData): FlowOption[] {
      return [
        ...users.map((id) => flow.userOptions.find((option) => option.id === id) ?? fallback({ kind: 'user', id })),
        ...nodes.map((ref) => flow.nodeOptions.find((option) => same(ref, option)) ?? fallback(ref)),
      ]
    },
  }
}
