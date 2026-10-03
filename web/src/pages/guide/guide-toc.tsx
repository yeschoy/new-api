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
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { GuideDoc } from './guide-types'

/** 本页内容: the article's sections, the one being read highlighted. Mounted once per article. */
export function GuideToc(props: { doc: GuideDoc }) {
  const { t } = useI18n()
  const [active, setActive] = useState(props.doc.sections[0]?.id ?? '')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting)
        if (visible?.target.id) setActive(visible.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    for (const section of document.querySelectorAll<HTMLElement>('[data-guide-section]')) observer.observe(section)
    return () => observer.disconnect()
  }, [props.doc])

  return (
    <aside className='sticky top-14 hidden h-fit py-10 xl:top-[78px] xl:block'>
      <p className='text-or-dim mb-3 text-[12px] font-medium'>{t('本页内容')}</p>
      <nav aria-label={t('本页内容')} className='flex flex-col gap-1'>
        {props.doc.sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={cn(
              'border-l-2 px-3 py-1 text-[13px] leading-5 transition-colors',
              active === section.id ? 'border-or-primary text-or-fg font-medium' : 'text-or-muted hover:text-or-fg border-transparent'
            )}
          >
            {t(section.title)}
          </a>
        ))}
      </nav>
    </aside>
  )
}
