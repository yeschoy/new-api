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
import { Menu, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Markdown } from '@/components/ui/markdown'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import handbookSource from './content/handbook.zh'
import {
  parseHandbookHeadings,
  stripHandbookTitle,
  type HandbookHeading,
} from './lib/handbook'

const headings = parseHandbookHeadings(handbookSource)
const body = stripHandbookTitle(handbookSource)

function matchesQuery(heading: HandbookHeading, query: string): boolean {
  return heading.text.toLowerCase().includes(query)
}

function Outline(props: {
  activeId: string
  query: string
  onQueryChange: (query: string) => void
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const needle = props.query.trim().toLowerCase()
  const visible = needle
    ? headings.filter((heading) => matchesQuery(heading, needle))
    : headings

  return (
    <nav aria-label={t('Documentation')} className='ed-docsOutline'>
      <label className='ed-docsSearch'>
        <Search size={14} aria-hidden='true' />
        <input
          type='search'
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          aria-label={t('Search documentation')}
          placeholder={t('Search documentation')}
        />
      </label>
      {visible.length === 0 ? (
        <p className='ed-panelNote px-3'>{t('No matching docs')}</p>
      ) : null}
      {visible.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          onClick={props.onNavigate}
          data-level={heading.level}
          className={cn(props.activeId === heading.id && 'is-active')}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  )
}

/** The documentation page: the complete tool handbook with an outline. */
export function GuidePage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')
  const articleRef = useRef<HTMLDivElement>(null)
  const readingMinutes = useMemo(
    () => Math.max(5, Math.round(handbookSource.length / 900)),
    []
  )

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
  }, [])

  return (
    <div className='ed-docs' data-testid='guide-shell'>
      <aside className='ed-docsSide'>
        <Outline activeId={activeId} query={query} onQueryChange={setQuery} />
      </aside>

      <main className='ed-docsMain'>
        <div className='ed-docsMobileBar'>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <button
                  type='button'
                  className='ed-btn ed-btn--outline ed-btn--sm'
                  aria-label={t('Open documentation navigation')}
                />
              }
            >
              <Menu aria-hidden='true' />
              {t('Contents')}
            </SheetTrigger>
            <SheetContent side='left' className='w-80 p-0'>
              <SheetHeader className='sr-only'>
                <SheetTitle>{t('Documentation')}</SheetTitle>
                <SheetDescription>{t('On this page')}</SheetDescription>
              </SheetHeader>
              <div className='h-full overflow-y-auto py-4'>
                <Outline
                  activeId={activeId}
                  query={query}
                  onQueryChange={setQuery}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <header className='ed-docsHead'>
          <p className='ed-eyebrow'>{t('Developer docs')}</p>
          <h1 className='ed-display'>{t('Complete tool handbook')}</h1>
          <p className='ed-lede'>
            {t(
              'Step-by-step setup and error lookup for every popular client, from chat apps to coding agents and workflow platforms.'
            )}
          </p>
          <p className='ed-docsMeta'>
            {t('{{count}} min read', { count: readingMinutes })}
          </p>
        </header>

        <div ref={articleRef} className='ed-handbook'>
          <Markdown>{body}</Markdown>
        </div>
      </main>
    </div>
  )
}
