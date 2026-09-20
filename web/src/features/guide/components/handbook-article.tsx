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
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

import handbookSource from '../content/handbook.zh'
import { parseHandbookHeadings, stripHandbookTitle } from '../lib/handbook'
import { MobileDocsNav } from './mobile-docs-nav'

type HandbookArticleProps = {
  mobileQuery: string
  onMobileQueryChange: (query: string) => void
}

/** Renders the long-form Chinese tool handbook with a sticky outline. */
export function HandbookArticle(props: HandbookArticleProps) {
  const { t } = useTranslation()
  const headings = useMemo(() => parseHandbookHeadings(handbookSource), [])
  const body = useMemo(() => stripHandbookTitle(handbookSource), [])
  const readingMinutes = Math.max(5, Math.round(handbookSource.length / 900))
  const articleRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const rendered = [...root.querySelectorAll<HTMLElement>('h1, h2')]
    rendered.forEach((element, index) => {
      const heading = headings[index]
      if (heading) element.id = heading.id
    })
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting)
        if (visible?.target.id) setActiveId(visible.target.id)
      },
      { rootMargin: '-10% 0px -75% 0px' }
    )
    rendered.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])

  return (
    <>
      <main className='min-w-0 px-4 py-5 sm:px-7 lg:px-10 lg:py-8 xl:px-14'>
        <div className='mx-auto max-w-[78ch]'>
          <div className='mb-6 flex items-center justify-between gap-3 lg:hidden'>
            <MobileDocsNav
              activeSlug='quick-start'
              query={props.mobileQuery}
              onQueryChange={props.onMobileQueryChange}
            />
            <Badge variant='outline'>{t('Developer docs')}</Badge>
          </div>

          <header className='mb-7'>
            <p className='ed-eyebrow'>{t('Developer docs')}</p>
            <div className='mt-3 flex flex-wrap items-start justify-between gap-3'>
              <h1 className='ed-display text-3xl sm:text-4xl'>
                {t('Complete tool handbook')}
              </h1>
              <Badge variant='secondary'>
                <HugeiconsIcon icon={Clock01Icon} data-icon='inline-start' />
                {t('{{count}} min read', { count: readingMinutes })}
              </Badge>
            </div>
            <p className='ed-lede mt-3 text-base'>
              {t(
                'Step-by-step setup and error lookup for every popular client, from chat apps to coding agents and workflow platforms.'
              )}
            </p>
          </header>

          <div ref={articleRef} className='ed-handbook'>
            <Markdown className='prose-base'>{body}</Markdown>
          </div>
        </div>
      </main>

      <aside
        data-testid='guide-toc'
        className='border-border sticky top-0 hidden h-[calc(100svh-var(--app-header-height,0px))] overflow-y-auto border-l px-4 py-8 xl:block'
      >
        <p className='text-muted-foreground mb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase'>
          {t('On this page')}
        </p>
        <nav aria-label={t('On this page')} className='flex flex-col gap-0.5'>
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className={cn(
                'hover:text-foreground border-l-2 border-transparent py-1 text-xs leading-5',
                heading.level === 1 ? 'mt-2 px-3 font-medium' : 'px-5',
                activeId === heading.id
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </aside>
    </>
  )
}
