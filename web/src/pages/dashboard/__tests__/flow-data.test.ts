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
import { buildFlow, type FlowSettings } from '../flow/flow-data'
import { layoutSankey } from '../flow/sankey-layout'

const ROWS = [
  { user_id: 1, username: 'ann', use_group: 'g1', model_name: 'm1', channel_id: 7, channel_name: 'c7', count: 6, quota: 600, token_used: 60 },
  { user_id: 1, username: 'ann', use_group: 'g2', model_name: 'm2', channel_id: 8, channel_name: 'c8', count: 3, quota: 300, token_used: 30 },
  { user_id: 2, username: 'ben', use_group: 'g1', model_name: 'm1', channel_id: 7, channel_name: 'c7', count: 1, quota: 100, token_used: 10 },
]

const SETTINGS: FlowSettings = {
  role: 'admin',
  metric: 'quota',
  stages: ['user', 'group', 'model', 'channel'],
  selectedUsers: [],
  selectedNodes: [],
  limit: 50,
  overflow: 'aggregate',
  active: null,
  activeLink: null,
  mask: false,
  labels: { deletedToken: (id) => `deleted ${id}`, unknown: 'unknown', other: (kind) => `other ${kind}` },
}

describe('flow graph', () => {
  it('joins rows that share a step and gives each band its share of the total', () => {
    const flow = buildFlow(ROWS, SETTINGS)
    const band = flow.links.find((link) => link.source === 'group:g1' && link.target === 'model:m1')
    expect(band).toMatchObject({ value: 700, requests: 7, share: 0.7 })
  })

  it('keeps only the selected users', () => {
    const flow = buildFlow(ROWS, { ...SETTINGS, selectedUsers: ['user:2'] })
    expect(flow.summary).toEqual({ quota: 100, tokens: 10, requests: 1 })
    expect(flow.nodes.map((node) => node.label)).toEqual(['ben', 'g1', 'm1', 'c7'])
  })

  it('highlights only the paths through a picked band', () => {
    const flow = buildFlow(ROWS, { ...SETTINGS, activeLink: { source: 'user:1', target: 'group:g2' } })
    expect(flow.nodes.filter((node) => node.highlighted).map((node) => node.label)).toEqual(['ann', 'g2', 'm2', 'c8'])
    expect(flow.links.find((link) => link.target === 'group:g1' && link.source === 'user:1')?.dimmed).toBe(true)
  })

  it('names a deleted key after its id', () => {
    const flow = buildFlow([{ token_id: 42, use_group: 'g', model_name: 'm', count: 1, quota: 1 }], { ...SETTINGS, role: 'user', stages: ['token', 'group', 'model'] })
    expect(flow.nodes[0].label).toBe('deleted 42')
  })

  it('offers each column the nodes left by the other columns filters', () => {
    const flow = buildFlow(ROWS, { ...SETTINGS, selectedNodes: [{ kind: 'group', id: 'group:g2' }] })
    expect(flow.nodeOptions.filter((option) => option.kind === 'group').map((option) => option.label)).toEqual(['g1', 'g2'])
    expect(flow.nodeOptions.filter((option) => option.kind === 'model').map((option) => option.label)).toEqual(['m2'])
  })
})

describe('sankey layout', () => {
  const flow = buildFlow(ROWS, SETTINGS)
  const layout = layoutSankey(flow.nodes, flow.links, flow.stages, 800, ['#111111', '#222222'], '#999999')

  it('puts each stage in its own column from left to right', () => {
    const xs = flow.stages.map((stage) => layout.nodes.find((node) => node.kind === stage)?.x ?? -1)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(new Set(xs).size).toBe(4)
  })

  it('keeps every node inside the drawing', () => {
    for (const node of layout.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height)
    }
  })

  it('draws the bigger of two nodes taller', () => {
    const ann = layout.nodes.find((node) => node.label === 'ann')
    const ben = layout.nodes.find((node) => node.label === 'ben')
    expect(ann && ben && ann.height > ben.height).toBe(true)
  })

  it('colours a band like the node it leaves', () => {
    const band = layout.links.find((link) => link.source === 'user:1')
    expect(band?.color).toBe(layout.nodes.find((node) => node.id === 'user:1')?.color)
  })
})
