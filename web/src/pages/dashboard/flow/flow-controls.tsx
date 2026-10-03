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
import { ChevronRight, EyeOff, Filter, X } from 'lucide-react'
import { Fragment } from 'react'

import { Button } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { Segmented } from '../segmented'
import type { FlowOption, NodeRef, Overflow } from './flow-data'
import type { FlowKind, FlowMetric } from './flow-paths'

/** Column names, what each column means, and the name of its merged "other" node. */
export const STAGE_INFO: Record<FlowKind, { label: string; hint: string; other: string }> = {
  user: { label: tk('用户|分流'), hint: tk('发起请求的用户'), other: tk('其他用户') },
  node: { label: tk('节点'), hint: tk('处理请求的部署节点'), other: tk('其他节点') },
  token: { label: tk('密钥'), hint: tk('请求使用的 API 密钥'), other: tk('其他密钥') },
  group: { label: tk('分组'), hint: tk('请求计费的分组'), other: tk('其他分组') },
  model: { label: tk('模型|表头'), hint: tk('请求调用的模型'), other: tk('其他模型') },
  channel: { label: tk('渠道|分流'), hint: tk('处理请求的上游渠道'), other: tk('其他渠道') },
}

const METRICS: Array<{ id: FlowMetric; label: string }> = [
  { id: 'quota', label: tk('按消费') },
  { id: 'tokens', label: tk('按 Token') },
  { id: 'requests', label: tk('按请求数') },
]

const LIMITS = [10, 20, 50, 100]

const OVERFLOWS: Array<{ id: Overflow; label: string }> = [
  { id: 'aggregate', label: tk('合并为其他') },
  { id: 'hide', label: tk('不显示') },
]

/** What sizes the bands, how many nodes a column keeps, what happens to the rest, and the node filter. */
export function FlowControls(props: {
  metric: FlowMetric
  onMetric: (metric: FlowMetric) => void
  limit: number
  onLimit: (limit: number) => void
  overflow: Overflow
  onOverflow: (overflow: Overflow) => void
  filters: number
  onFilter: () => void
}) {
  const { t } = useI18n()
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Segmented ariaLabel={t('线宽依据')} items={METRICS.map((item) => ({ id: item.id, label: t(item.label) }))} value={props.metric} onChange={props.onMetric} />
      <Segmented ariaLabel={t('显示数量')} items={LIMITS.map((item) => ({ id: item, label: t('前 {count} 名', { count: item }) }))} value={props.limit} onChange={props.onLimit} />
      <Segmented ariaLabel={t('超出部分')} items={OVERFLOWS.map((item) => ({ id: item.id, label: t(item.label) }))} value={props.overflow} onChange={props.onOverflow} />
      <Button onClick={props.onFilter}>
        <Filter className='size-4' aria-hidden='true' />
        {t('筛选节点')}
        {props.filters > 0 ? <span className='bg-or-primary-soft text-or-primary rounded-[4px] px-1.5 text-[12px] tabular-nums'>{props.filters}</span> : null}
      </Button>
    </div>
  )
}

/** The columns in order; each can be hidden while at least two stay. */
export function StageToggles(props: { stages: FlowKind[]; hidden: FlowKind[]; onToggle: (stage: FlowKind) => void }) {
  const { t } = useI18n()
  const shown = props.stages.filter((stage) => !props.hidden.includes(stage)).length
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1'>
      {props.stages.map((stage, index) => {
        const visible = !props.hidden.includes(stage)
        return (
          <Fragment key={stage}>
            {index > 0 ? <ChevronRight className='text-or-dim size-3.5 shrink-0' aria-hidden='true' /> : null}
            <button
              type='button'
              aria-pressed={visible}
              disabled={visible && shown <= 2}
              title={t(STAGE_INFO[stage].hint)}
              onClick={() => props.onToggle(stage)}
              className={cn(
                'border-or-line flex h-7 items-center gap-1 rounded-[6px] border px-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
                visible ? 'bg-or-card text-or-fg' : 'text-or-dim border-dashed'
              )}
            >
              {visible ? null : <EyeOff className='size-3' aria-hidden='true' />}
              {t(STAGE_INFO[stage].label)}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

/** The picked users and nodes, each removable. */
export function FilterChips(props: { chosen: FlowOption[]; onRemove: (node: NodeRef) => void; onClear: () => void }) {
  const { t } = useI18n()
  if (props.chosen.length === 0) return null
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {props.chosen.map((option) => {
        const name = t('{stage}：{name}', { stage: t(STAGE_INFO[option.kind].label), name: option.label })
        return (
          <span key={`${option.kind}-${option.id}`} className='border-or-line bg-or-fill flex h-7 max-w-[260px] items-center gap-1 rounded-[6px] border pr-1 pl-2 text-[13px]'>
            <span className='truncate'>{name}</span>
            <button
              type='button'
              aria-label={t('移除筛选：{name}', { name })}
              onClick={() => props.onRemove({ kind: option.kind, id: option.id })}
              className='text-or-muted hover:bg-or-fill hover:text-or-fg flex size-5 shrink-0 items-center justify-center rounded-[4px]'
            >
              <X className='size-3.5' aria-hidden='true' />
            </button>
          </span>
        )
      })}
      {props.chosen.length > 1 ? (
        <Button size='sm' variant='ghost' onClick={props.onClear}>
          {t('清除全部')}
        </Button>
      ) : null}
    </div>
  )
}
