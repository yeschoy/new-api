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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { compactNumber } from '@/lib/format'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { getFlowRows } from '../dashboard-api'
import { EmptyNote, Section, formatCount } from '../dashboard-ui'
import { RangeFilter, presetRange } from '../range-filter'
import { FilterChips, FlowControls, STAGE_INFO, StageToggles } from './flow-controls'
import { ROLE_STAGES, buildFlow, type FlowData, type FlowRole, type LinkRef, type NodeRef, type Overflow } from './flow-data'
import { FlowFilterDialog } from './flow-filter'
import type { FlowKind, FlowMetric } from './flow-paths'
import { SankeyChart } from './sankey-chart'
import { useFlowSelection } from './use-flow-selection'

/** The name of what is highlighted, as shown (masked names stay masked). */
function highlightName(flow: FlowData, active: NodeRef | null, link: LinkRef | null): string | null {
  if (active) return flow.nodes.find((node) => node.kind === active.kind && node.id === active.id)?.label ?? null
  if (!link) return null
  const found = flow.links.find((item) => item.source === link.source && item.target === link.target)
  return found ? `${found.sourceLabel} → ${found.targetLabel}` : null
}

/** Where the requests went in a range: filters and settings above, the Sankey diagram below. */
export function FlowView(props: { role: FlowRole; initialDays: number }) {
  const { t, lang } = useI18n()
  const money = useMoney()
  const admin = props.role !== 'user'
  const stagesOfRole = ROLE_STAGES[props.role]
  const [range, setRange] = useState(() => presetRange(props.initialDays))
  const [username, setUsername] = useState('')
  const [metric, setMetric] = useState<FlowMetric>('quota')
  const [limit, setLimit] = useState(50)
  const [overflow, setOverflow] = useState<Overflow>('aggregate')
  const [hidden, setHidden] = useState<FlowKind[]>([])
  const [masked, setMasked] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const selection = useFlowSelection()

  const rows = useQuery({
    queryKey: useConsoleKey('dashboard', 'flow', admin ? 'all' : 'self', range.window.start, range.window.end, username),
    queryFn: () => getFlowRows(range.window, { admin, username }),
    placeholderData: keepPreviousData,
  })
  const current = rows.isError ? undefined : rows.data
  const flow = useMemo(
    () =>
      buildFlow(current ?? [], {
        role: props.role,
        metric,
        stages: stagesOfRole.filter((stage) => !hidden.includes(stage)),
        selectedUsers: selection.users,
        selectedNodes: selection.nodes,
        limit,
        overflow,
        active: selection.active,
        activeLink: selection.link,
        mask: masked,
        labels: { deletedToken: (id) => t('已删除（{id}）', { id }), unknown: t('未知'), other: (kind) => t(STAGE_INFO[kind].other) },
      }),
    // lang: the labels above are in the page language.
    [current, props.role, stagesOfRole, metric, hidden, selection.users, selection.nodes, limit, overflow, selection.active, selection.link, masked, t, lang]
  )

  const toggleStage = (stage: FlowKind) => {
    const next = hidden.includes(stage) ? hidden.filter((item) => item !== stage) : [...hidden, stage]
    setHidden(next)
    selection.dropStages(next)
  }
  let valueLabel = (value: number) => formatCount(value)
  if (metric === 'quota') valueLabel = (value: number) => money.format(value)
  else if (metric === 'tokens') valueLabel = (value: number) => compactNumber(value)
  const chosen = selection.chosen(flow)
  const lit = highlightName(flow, selection.active, selection.link)

  let body: React.ReactNode = null
  if (rows.isLoading) body = <EmptyNote>{t('加载中…')}</EmptyNote>
  else if (!rows.isError && flow.links.length === 0) body = <EmptyNote>{t('暂无分流数据')}</EmptyNote>
  else if (!rows.isError) {
    body = (
      <SankeyChart
        nodes={flow.nodes}
        links={flow.links}
        stages={flow.stages}
        valueLabel={valueLabel}
        active={selection.active}
        activeLink={selection.link}
        onNode={selection.pickNode}
        onLink={selection.pickLink}
        onClear={selection.clearHighlight}
      />
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <RangeFilter range={range} onRange={setRange} username={username} onUsername={admin ? setUsername : undefined} />
        <Button onClick={() => setMasked(!masked)}>
          {masked ? <Eye className='size-4' aria-hidden='true' /> : <EyeOff className='size-4' aria-hidden='true' />}
          {masked ? t('显示敏感信息') : t('隐藏敏感信息')}
        </Button>
      </div>
      <FlowControls
        metric={metric}
        onMetric={setMetric}
        limit={limit}
        onLimit={setLimit}
        overflow={overflow}
        onOverflow={setOverflow}
        filters={chosen.length}
        onFilter={() => setFiltering(true)}
      />
      <FilterChips chosen={chosen} onRemove={selection.toggle} onClear={selection.clearFilters} />
      {rows.isError ? <Notice tone='error'>{errorMessage(rows.error, t('分流数据加载失败'))}</Notice> : null}
      <Section
        title={t('请求流向')}
        description={t('合计 {amount} · {tokens} Token · {count} 次请求', {
          amount: money.format(flow.summary.quota),
          tokens: formatCount(flow.summary.tokens),
          count: formatCount(flow.summary.requests),
        })}
        extra={<StageToggles stages={stagesOfRole} hidden={hidden} onToggle={toggleStage} />}
        flush
      >
        {lit ? (
          <div className='border-or-line flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2 text-[13px]'>
            <span className='min-w-0 truncate'>{t('已高亮：{name}', { name: lit })}</span>
            <Button size='sm' variant='ghost' onClick={selection.clearHighlight}>
              {t('清除高亮')}
            </Button>
          </div>
        ) : null}
        {body}
      </Section>
      {filtering ? (
        <FlowFilterDialog
          stages={flow.stages}
          options={[...flow.userOptions, ...flow.nodeOptions.filter((option) => option.kind !== 'user')]}
          chosen={[...selection.users.map((id) => ({ kind: 'user' as const, id })), ...selection.nodes]}
          format={valueLabel}
          onToggle={selection.toggle}
          onClear={selection.clearFilters}
          onClose={() => setFiltering(false)}
        />
      ) : null}
    </div>
  )
}
