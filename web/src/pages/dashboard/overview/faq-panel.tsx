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
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { FaqItem } from '../dashboard-api'
import { EmptyNote, Section } from '../dashboard-ui'
import { RichText, plainText } from './rich-text'

/** Questions the operator answered; each answer opens in place. */
export function FaqPanel(props: { items: FaqItem[] }) {
  const { t } = useI18n()
  return (
    <Section title={t('常见问题')} description={t('关于接入与计费的常见问题')} flush>
      {props.items.length === 0 ? <EmptyNote>{t('暂无常见问题')}</EmptyNote> : null}
      <ul className='max-h-[320px] overflow-y-auto'>
        {props.items.map((item, index) => (
          <FaqEntry key={item.id ?? index} item={item} />
        ))}
      </ul>
    </Section>
  )
}

function FaqEntry(props: { item: FaqItem }) {
  const [open, setOpen] = useState(false)
  const answerId = useId()
  return (
    <li className='border-or-line border-b last:border-b-0'>
      <button
        type='button'
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen(!open)}
        className='hover:bg-or-fill flex w-full items-start justify-between gap-3 px-5 py-3 text-left text-[14px] font-medium'
      >
        <span className='min-w-0'>{plainText(props.item.question)}</span>
        <ChevronDown className={cn('text-or-muted mt-0.5 size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden='true' />
      </button>
      <div id={answerId} hidden={!open} className='px-5 pb-4'>
        <RichText text={props.item.answer} className='text-or-muted text-[13px] leading-6' />
      </div>
    </li>
  )
}
