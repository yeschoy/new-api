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
import { ArrowLeft, ArrowRight, Clock, Menu } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Modal, Tabs } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { DocBlock } from './guide-blocks'
import { PLATFORM_LABELS, guideHref, guideNeighbors } from './guide-catalog'
import { EnvironmentPanel } from './guide-environment'
import type { GuideValues } from './guide-runtime'
import { GuideSidebar } from './guide-sidebar'
import type { GuideDoc, GuidePlatform } from './guide-types'
import type { GuideEnvironment } from './use-guide-environment'

function Neighbor(props: { doc: GuideDoc; next: boolean }) {
  const { t } = useI18n()
  return (
    <Link
      to={guideHref(props.doc.slug)}
      className={cn(
        'border-or-line hover:bg-or-fill flex min-h-16 min-w-0 items-center gap-2 rounded-[8px] border px-4 py-3 text-[14px] font-medium transition-colors',
        props.next && 'justify-end text-right'
      )}
    >
      {props.next ? null : <ArrowLeft className='size-4 shrink-0' aria-hidden='true' />}
      <span className='min-w-0'>
        <small className='text-or-dim block text-[12px] font-normal'>{props.next ? t('下一篇') : t('上一篇')}</small>
        {t(props.doc.title)}
      </span>
      {props.next ? <ArrowRight className='size-4 shrink-0' aria-hidden='true' /> : null}
    </Link>
  )
}

/** On phones the article list opens in a dialog. */
function PhoneNav(props: { active: GuideDoc['slug']; query: string; onQuery: (query: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className='mb-6 lg:hidden'>
      <button
        type='button'
        aria-label={t('打开文档导航')}
        onClick={() => setOpen(true)}
        className='border-or-line bg-or-bg hover:bg-or-fill flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[14px] font-medium transition-colors'
      >
        <Menu className='size-4' aria-hidden='true' />
        {t('浏览文档')}
      </button>
      {open ? (
        <Modal title={t('文档')} onClose={() => setOpen(false)}>
          <p className='text-or-muted mb-4 text-[13px]'>{t('选择指南，或搜索全部配置说明。')}</p>
          <GuideSidebar active={props.active} query={props.query} onQuery={props.onQuery} onNavigate={() => setOpen(false)} />
        </Modal>
      ) : null}
    </div>
  )
}

export function GuideArticle(props: {
  doc: GuideDoc
  environment: GuideEnvironment
  values: GuideValues
  platform: GuidePlatform
  platforms: GuidePlatform[]
  onPlatform: (platform: GuidePlatform) => void
  query: string
  onQuery: (query: string) => void
}) {
  const { t } = useI18n()
  const neighbors = guideNeighbors(props.doc.slug)
  const verified = props.environment.status === 'ready'

  return (
    // Filled-in addresses are long unbroken words; let them wrap on narrow screens.
    <article className='min-w-0 py-8 break-words lg:py-10'>
      <div className='mx-auto max-w-[760px]'>
        <PhoneNav active={props.doc.slug} query={props.query} onQuery={props.onQuery} />

        <header className='mb-7'>
          <p className='text-or-primary text-[13px] font-medium'>{t('开发者文档')}</p>
          <div className='mt-2 flex flex-wrap items-start justify-between gap-3'>
            <h1 className='text-[32px] leading-[1.2] font-bold tracking-[-0.8px] md:text-[40px]'>{t(props.doc.title)}</h1>
            <span className='border-or-line text-or-muted mt-2 inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[12px] whitespace-nowrap'>
              <Clock className='size-3.5' aria-hidden='true' />
              {t('阅读约 {count} 分钟', { count: props.doc.readingMinutes })}
            </span>
          </div>
          <p className='text-or-muted mt-3 text-[16px] leading-7'>{t(props.doc.summary, props.values)}</p>
        </header>

        <EnvironmentPanel environment={props.environment} baseUrl={props.values.baseUrl} />

        {props.platforms.length ? (
          <Tabs
            className='mt-8'
            ariaLabel={t('平台')}
            items={props.platforms.map((id) => ({ id, label: PLATFORM_LABELS[id] }))}
            value={props.platform}
            onChange={props.onPlatform}
          />
        ) : null}

        <div className='mt-8'>
          {props.doc.sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              data-guide-section='true'
              className={cn('scroll-mt-20 xl:scroll-mt-[102px]', index > 0 && 'border-or-line mt-10 border-t pt-10')}
            >
              <h2 className='text-[24px] leading-8 font-bold tracking-[-0.4px]'>{t(section.title)}</h2>
              {section.blocks.map((block, blockIndex) => (
                <DocBlock
                  key={`${section.id}-${blockIndex}`}
                  block={block}
                  values={props.values}
                  verified={verified}
                  platform={props.platform}
                  contextLength={props.environment.contextLength}
                />
              ))}
            </section>
          ))}
        </div>

        <nav aria-label={t('文章导航')} className='mt-12 grid gap-3 sm:grid-cols-2'>
          {neighbors.previous ? <Neighbor doc={neighbors.previous} next={false} /> : <span />}
          {neighbors.next ? <Neighbor doc={neighbors.next} next /> : null}
        </nav>
      </div>
    </article>
  )
}
