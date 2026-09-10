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
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { searchGuideDocs } from '@/features/guide/lib/search'

export function DocsSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const hits = useMemo(() => searchGuideDocs(query, t), [query, t])

  const goToHit = (hit: (typeof hits)[number]) => {
    setOpen(false)
    if (hit.kind === 'tool' && hit.toolId) {
      void navigate({
        to: '/guide',
        search: { q: query.trim() || undefined, tool: hit.toolId },
      })
      return
    }
    void navigate({
      to: '/guide',
      search: { q: query.trim() || undefined },
      hash: hit.hash,
    })
  }

  return (
    <form
      className='ci-appDocsSearchWrap'
      onSubmit={(event) => {
        event.preventDefault()
        setOpen(false)
        void navigate({
          to: '/guide',
          search: { q: query.trim() || undefined },
        })
      }}
    >
      <label className='ci-appDocsSearch'>
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120)
          }}
          placeholder={t('Search docs...')}
          aria-label={t('Search docs...')}
          autoComplete='off'
        />
      </label>
      {open && query.trim() ? (
        <div className='ci-appDocsHits' role='listbox'>
          {hits.length === 0 ? (
            <p>{t('No matching docs')}</p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.id}
                type='button'
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goToHit(hit)}
              >
                <strong>{hit.title}</strong>
                <span>{hit.snippet}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </form>
  )
}
