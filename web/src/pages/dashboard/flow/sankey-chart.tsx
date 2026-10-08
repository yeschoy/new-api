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
import { useMemo, useState } from 'react'

import { ROUTER_CHART } from '@/components/stacked-bars'
import { useI18n } from '@/i18n/i18n'
import { useMoney } from '@/pages/console/console-hooks'

import { OTHER_COLOR, formatShare, useWidth } from '../charts/chart-scale'
import { formatCount } from '../dashboard-ui'
import type { FlowLink, FlowNode, LinkRef, NodeRef } from './flow-data'
import type { FlowKind, Metrics } from './flow-paths'
import { NODE_WIDTH, layoutSankey, type Sankey } from './sankey-layout'

/** Room per column, so labels stay readable; narrower screens scroll the chart sideways. */
const COLUMN_WIDTH = 180

type Tip = { x: number; y: number; title: string; metrics: Metrics; share?: number }

function cut(text: string, chars: number): string {
  return text.length > chars ? `${text.slice(0, Math.max(1, chars - 1))}…` : text
}

function linkOpacity(link: FlowLink): number {
  if (link.dimmed) return 0.06
  if (link.highlighted) return 0.7
  return 0.3
}

/**
 * The flow as a Sankey diagram. Nodes are buttons: picking one (or a band)
 * highlights the paths through it; picking the background clears it.
 */
export function SankeyChart(props: {
  nodes: FlowNode[]
  links: FlowLink[]
  stages: FlowKind[]
  valueLabel: (value: number) => string
  active: NodeRef | null
  activeLink: LinkRef | null
  onNode: (node: NodeRef) => void
  onLink: (link: LinkRef) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const { ref, width } = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const layoutWidth = Math.max(width, props.stages.length * COLUMN_WIDTH)
  const layout: Sankey = useMemo(
    () => layoutSankey(props.nodes, props.links, props.stages, layoutWidth, ROUTER_CHART.palette.slice(0, -1), OTHER_COLOR),
    [props.nodes, props.links, props.stages, layoutWidth]
  )
  const chars = Math.max(6, Math.floor((layout.spacing - NODE_WIDTH - 72) / 7))
  const last = props.stages.length - 1

  const point = (event: React.PointerEvent<SVGElement>, title: string, metrics: Metrics, share?: number) => {
    const box = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect()
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, title, metrics, share })
  }
  const pressed = (kind: FlowKind, id: string) => props.active?.kind === kind && props.active.id === id

  return (
    <div ref={ref} className='overflow-x-auto'>
      <div className='relative' style={{ width: layout.width }} onPointerLeave={() => setTip(null)}>
        <svg width={layout.width} height={layout.height} role='group' aria-label={t('请求流向')} onClick={props.onClear} className='block'>
          <g>
            {layout.links.map((link) => (
              <path
                key={`${link.source}-${link.target}`}
                d={link.path}
                style={{ fill: link.color }}
                opacity={linkOpacity(link)}
                className='cursor-pointer transition-opacity hover:opacity-80'
                onPointerMove={(event) => point(event, `${link.sourceLabel} → ${link.targetLabel}`, link, link.share)}
                onClick={(event) => {
                  event.stopPropagation()
                  props.onLink({ source: link.source, target: link.target })
                }}
              />
            ))}
          </g>
          <g>
            {layout.nodes.map((node) => (
              <rect
                key={node.id}
                role='button'
                tabIndex={0}
                aria-label={node.label}
                aria-pressed={pressed(node.kind, node.id)}
                x={node.x}
                y={node.y}
                width={NODE_WIDTH}
                height={node.height}
                rx={2}
                style={{ fill: node.color }}
                opacity={node.dimmed ? 0.25 : 1}
                className='cursor-pointer outline-none focus-visible:[stroke-width:2] focus-visible:[stroke:var(--or-fg)]'
                onPointerMove={(event) => point(event, node.label, node)}
                onClick={(event) => {
                  event.stopPropagation()
                  props.onNode({ kind: node.kind, id: node.id })
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  props.onNode({ kind: node.kind, id: node.id })
                }}
              />
            ))}
          </g>
          <g pointerEvents='none' fontSize='12'>
            {layout.nodes.map((node) => {
              const right = node.column < last
              return (
                <text
                  key={node.id}
                  x={right ? node.x + NODE_WIDTH + 6 : node.x - 6}
                  y={node.y + node.height / 2 + 4}
                  textAnchor={right ? 'start' : 'end'}
                  opacity={node.dimmed ? 0.35 : 1}
                  style={{ fill: 'var(--or-fg)', stroke: 'var(--or-card)', strokeWidth: 3, paintOrder: 'stroke' }}
                >
                  <tspan>{cut(node.label, chars)}</tspan>
                  <tspan dx='6' style={{ fill: 'var(--or-dim)' }}>
                    {props.valueLabel(node.value)}
                  </tspan>
                </text>
              )
            })}
          </g>
        </svg>
        {tip ? <FlowTip tip={tip} flip={tip.x > layout.width / 2} /> : null}
      </div>
    </div>
  )
}

function FlowTip(props: { tip: Tip; flip: boolean }) {
  const { t } = useI18n()
  const money = useMoney()
  const tip = props.tip
  const position = props.flip ? { right: `calc(100% - ${tip.x - 12}px)`, top: tip.y + 12 } : { left: tip.x + 12, top: tip.y + 12 }
  return (
    <div className='border-or-line bg-or-card text-or-fg pointer-events-none absolute z-10 min-w-[180px] max-w-[300px] rounded-[8px] border px-3 py-2 text-[12px] shadow-xl' style={position}>
      <div className='mb-1 font-semibold break-words'>{tip.title}</div>
      <Row label={t('消费')} value={money.format(tip.metrics.quota)} />
      <Row label='Token' value={formatCount(tip.metrics.tokens)} />
      <Row label={t('请求数')} value={formatCount(tip.metrics.requests)} />
      {tip.share !== undefined ? <Row label={t('占比')} value={formatShare(tip.share)} /> : null}
    </div>
  )
}

function Row(props: { label: string; value: string }) {
  return (
    <div className='flex justify-between gap-4'>
      <span className='text-or-muted'>{props.label}</span>
      <span className='tabular-nums'>{props.value}</span>
    </div>
  )
}
