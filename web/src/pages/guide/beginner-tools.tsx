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
import { Sparkles, X } from 'lucide-react'
import { useState } from 'react'

import { Tabs, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { BEGINNER_TOOLS, CATEGORIES, STATUS_META, filterTools } from './beginner-catalog'
import { ToolDialog } from './beginner-tool-dialog'
import type { BeginnerTool, ToolCategory, UseCase } from './beginner-types'
import type { GuideAddress } from './guide-address'

function Chip(props: { label: string; ariaLabel: string; onClear: () => void }) {
  return (
    <button
      type='button'
      aria-label={props.ariaLabel}
      onClick={props.onClear}
      className='border-or-primary/40 bg-or-primary-soft text-or-primary inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold'
    >
      <span className='truncate'>{props.label}</span>
      <X className='size-3.5 shrink-0' aria-hidden='true' />
    </button>
  )
}

function ToolCard(props: { tool: BeginnerTool; onOpen: () => void }) {
  const { t } = useI18n()
  const status = STATUS_META[props.tool.status]
  return (
    <button
      type='button'
      onClick={props.onOpen}
      className='border-or-line bg-or-card hover:border-or-fg/20 group flex min-w-0 flex-col gap-2.5 rounded-[8px] border p-5 text-left transition-colors'
    >
      <span className='flex items-center justify-between gap-2'>
        <span className='min-w-0 text-[15px] font-semibold'>{t(props.tool.name)}</span>
        <span className='flex shrink-0 items-center gap-1.5'>
          {props.tool.recommended ? (
            <Tag tone='success'>
              <Sparkles className='mr-1 size-3' aria-hidden='true' />
              {t('推荐')}
            </Tag>
          ) : null}
          <span role='img' aria-label={t(status.label)} title={t(status.label)} className={cn('size-2.5 rounded-full', status.dot)} />
        </span>
      </span>
      <span className='text-or-muted text-[13px] leading-5'>{t(props.tool.summary)}</span>
      <span className='text-or-muted group-hover:text-or-primary mt-auto text-[13px] font-medium transition-colors'>{t('查看设置步骤')} →</span>
    </button>
  )
}

/**
 * Every tool as a card, by category, narrowed by a picked use case or the
 * ?q search; a card opens its steps. ?tool opens one on arrival.
 */
export function ToolExplorer(props: {
  address: GuideAddress
  query: string
  onClearQuery: () => void
  openToolId: string | null
  focus: UseCase | null
  onClearFocus: () => void
}) {
  const { t } = useI18n()
  const [category, setCategory] = useState<ToolCategory | 'all'>('all')
  const [active, setActive] = useState<BeginnerTool | null>(() => BEGINNER_TOOLS.find((tool) => tool.id === props.openToolId) ?? null)
  const tools = filterTools({ category, focus: props.focus?.toolIds, query: props.query, translate: (text) => t(text) })

  return (
    <div className='mt-6 flex flex-col gap-5'>
      {props.focus || props.query.trim() ? (
        <div className='flex flex-wrap gap-2'>
          {props.focus ? <Chip label={t(props.focus.useCase)} ariaLabel={t('清除筛选器')} onClear={props.onClearFocus} /> : null}
          {props.query.trim() ? <Chip label={`“${props.query.trim()}”`} ariaLabel={t('清除搜索')} onClear={props.onClearQuery} /> : null}
        </div>
      ) : null}

      <Tabs
        ariaLabel={t('工具分类')}
        items={CATEGORIES.map((item) => ({ id: item.id, label: t(item.label) }))}
        value={category}
        onChange={setCategory}
      />

      <div className='text-or-muted flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]'>
        {Object.values(STATUS_META).map((status) => (
          <span key={status.label} className='inline-flex items-center gap-1.5'>
            <span className={cn('size-2.5 rounded-full', status.dot)} aria-hidden='true' />
            {t(status.label)}
          </span>
        ))}
      </div>

      {tools.length ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => setActive(tool)} />
          ))}
        </div>
      ) : (
        <p className='text-or-muted text-[14px]'>{t('没有符合条件的工具')}</p>
      )}

      {active ? <ToolDialog tool={active} address={props.address} onClose={() => setActive(null)} /> : null}
    </div>
  )
}
