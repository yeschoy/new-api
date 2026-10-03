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
import { Search } from 'lucide-react'
import { Link } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { GUIDE_DOCS, GUIDE_GROUPS, guideHref, searchGuide } from './guide-catalog'
import type { GuideDocSlug } from './guide-types'

/** The article list, or the search results while there is a query. */
export function GuideSidebar(props: { active: GuideDocSlug; query: string; onQuery: (query: string) => void; onNavigate?: () => void }) {
  const { t } = useI18n()
  const searching = props.query.trim() !== ''
  const hits = searchGuide(props.query, (text) => t(text))

  return (
    <nav aria-label={t('文档')} className='flex min-h-0 flex-col gap-4'>
      <label className='relative block'>
        <Search className='text-or-dim pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' aria-hidden='true' />
        <input
          type='search'
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          aria-label={t('搜索文档')}
          placeholder={t('搜索文档')}
          className='border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 h-9 w-full rounded-[6px] border pr-3 pl-8 text-[14px] outline-none transition-colors'
        />
      </label>

      {searching ? (
        <div className='flex flex-col gap-1'>
          <p className='text-or-dim px-2 text-[12px] font-medium'>{hits.length ? t('搜索结果') : t('文档里没有这条')}</p>
          {hits.map((hit) => (
            <Link
              key={hit.slug}
              to={`${guideHref(hit.slug)}#${hit.sectionId}`}
              onClick={props.onNavigate}
              className='hover:bg-or-fill rounded-[6px] px-2 py-2 transition-colors'
            >
              <strong className='block text-[14px] font-medium'>{hit.title}</strong>
              <span className='text-or-muted mt-0.5 block text-[12px]'>{hit.snippet}</span>
            </Link>
          ))}
        </div>
      ) : (
        GUIDE_GROUPS.map((group) => (
          <div key={group.id}>
            <p className='text-or-dim mb-1 px-2 text-[12px] font-medium'>{t(group.label)}</p>
            <div className='flex flex-col gap-0.5'>
              {GUIDE_DOCS.filter((doc) => doc.group === group.id).map((doc) => {
                const active = doc.slug === props.active
                return (
                  <Link
                    key={doc.slug}
                    to={guideHref(doc.slug)}
                    onClick={props.onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-[6px] px-2 py-1.5 text-[14px] transition-colors',
                      active ? 'bg-or-primary-soft text-or-primary font-medium' : 'text-or-muted hover:bg-or-fill hover:text-or-fg'
                    )}
                  >
                    {t(doc.title)}
                  </Link>
                )
              })}
            </div>
          </div>
        ))
      )}
    </nav>
  )
}
