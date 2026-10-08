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
import { ChevronDown, LifeBuoy, WandSparkles, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { DIFFICULTY } from './beginner-catalog'
import { TROUBLESHOOT_ROWS, USE_CASES } from './beginner-help'
import type { TroubleshootRow, UseCase } from './beginner-types'

function SectionHead(props: { id: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <div className='flex items-center gap-3'>
      <span className='bg-or-primary-soft text-or-primary flex size-10 shrink-0 items-center justify-center rounded-[10px]'>
        <props.icon className='size-5' aria-hidden='true' />
      </span>
      <div className='min-w-0'>
        <h2 id={props.id} className='text-[22px] leading-7 font-bold tracking-[-0.4px] md:text-[24px]'>
          {props.title}
        </h2>
        <p className='text-or-muted text-[14px] leading-6'>{props.text}</p>
      </div>
    </div>
  )
}

/** "What do you want to do?": picking a card narrows the tool list to the tools for it. */
export function UseCasePicker(props: { active?: string; onPick: (row: UseCase) => void }) {
  const { t } = useI18n()
  return (
    <section id='usecases' aria-labelledby='usecases-title' className='scroll-mt-20 xl:scroll-mt-[102px]'>
      <SectionHead id='usecases-title' icon={WandSparkles} title={t('不知道选哪个工具？从你想做的事开始')} text={t('选好工具，照步骤做')} />
      <div className='mt-6 grid gap-3 sm:grid-cols-2'>
        {USE_CASES.map((row) => {
          const selected = props.active === row.useCase
          return (
            <button
              key={row.useCase}
              type='button'
              aria-pressed={selected}
              onClick={() => props.onPick(row)}
              className={cn(
                'flex min-w-0 items-center justify-between gap-3 rounded-[8px] border px-4 py-3.5 text-left transition-colors',
                selected ? 'border-or-primary/60 bg-or-primary-soft' : 'border-or-line bg-or-card hover:bg-or-fill'
              )}
            >
              <span className='min-w-0'>
                <span className='block text-[14px] font-semibold'>{t(row.useCase)}</span>
                <span className='text-or-muted mt-0.5 block truncate text-[12px]'>{t(row.tools)}</span>
              </span>
              <Tag tone={DIFFICULTY[row.difficulty].tone}>{t(DIFFICULTY[row.difficulty].label)}</Tag>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ErrorRow(props: { row: TroubleshootRow }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <div className='px-5'>
      <h3>
        <button
          type='button'
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((value) => !value)}
          className='font-geist flex w-full items-center justify-between gap-3 py-4 text-left text-[14px] font-semibold'
        >
          {t(props.row.error)}
          <ChevronDown className={cn('text-or-muted size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden='true' />
        </button>
      </h3>
      <div id={panel} hidden={!open} className='flex flex-col gap-2 pb-4 text-[14px] leading-6'>
        <p>
          <span className='text-or-muted'>{t('含义：')}</span>
          <span>{t(props.row.meaning)}</span>
        </p>
        <p>
          <span className='text-or-primary font-semibold'>{t('解决办法：')}</span>
          <span>{t(props.row.fix)}</span>
        </p>
      </div>
    </div>
  )
}

/** Common errors in plain words, each opening to what it means and how to fix it. */
export function Troubleshoot() {
  const { t } = useI18n()
  return (
    <section id='troubleshoot' aria-labelledby='troubleshoot-title' className='scroll-mt-20 xl:scroll-mt-[102px]'>
      <SectionHead id='troubleshoot-title' icon={LifeBuoy} title={t('看到报错？在这里查含义')} text={t('所有常见错误都用大白话解释，解决办法就在旁边')} />
      <div className='border-or-line bg-or-card divide-or-line mt-6 divide-y rounded-[8px] border'>
        {TROUBLESHOOT_ROWS.map((row) => (
          <ErrorRow key={row.error} row={row} />
        ))}
      </div>
    </section>
  )
}
