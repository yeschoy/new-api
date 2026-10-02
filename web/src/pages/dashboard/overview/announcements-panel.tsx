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

import { Modal } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime } from '@/lib/format'

import type { AnnouncementItem } from '../dashboard-api'
import { EmptyNote, Section, StatusDot, type DotTone } from '../dashboard-ui'
import { RichText, plainText } from './rich-text'

const TYPE_TONES: Record<string, DotTone> = { ongoing: 'info', success: 'good', warning: 'warn', error: 'bad' }

function publishedAt(item: AnnouncementItem): string {
  const ms = item.publishDate ? Date.parse(item.publishDate) : Number.NaN
  return Number.isFinite(ms) ? dateTime(Math.floor(ms / 1000)) : ''
}

/** The operator's announcements, newest as listed; each opens in full. */
export function AnnouncementsPanel(props: { items: AnnouncementItem[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<AnnouncementItem | null>(null)

  return (
    <Section title={t('公告')} description={t('平台最新动态与通知')} flush>
      {props.items.length === 0 ? <EmptyNote>{t('暂无公告')}</EmptyNote> : null}
      <ul className='max-h-[320px] overflow-y-auto'>
        {props.items.map((item, index) => (
          <li key={item.id ?? index} className='border-or-line border-b last:border-b-0'>
            <button type='button' onClick={() => setOpen(item)} className='hover:bg-or-fill flex w-full items-start gap-2.5 px-5 py-3 text-left'>
              <StatusDot tone={TYPE_TONES[item.type ?? ''] ?? 'neutral'} className='mt-1.5' />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='line-clamp-2 text-[14px]'>{plainText(item.content)}</span>
                {publishedAt(item) ? <span className='text-or-dim text-[12px]'>{publishedAt(item)}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <Modal title={t('公告详情')} onClose={() => setOpen(null)} size='lg'>
          {publishedAt(open) ? <p className='text-or-dim mb-3 text-[12px]'>{t('发布于 {date}', { date: publishedAt(open) })}</p> : null}
          <RichText text={open.content} className='text-[14px] leading-6' />
          {open.extra ? (
            <div className='border-or-line mt-4 border-t pt-4'>
              <h3 className='mb-1.5 text-[13px] font-medium'>{t('补充说明')}</h3>
              <RichText text={open.extra} className='text-or-muted text-[13px] leading-6' />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </Section>
  )
}
