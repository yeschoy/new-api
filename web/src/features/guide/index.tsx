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
import { ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

import handbookSource from './content/handbook.zh'
import {
  parseHandbook,
  type HandbookTool,
  type HandbookToolStatus,
} from './lib/handbook'

const handbook = parseHandbook(handbookSource)

const STATUS_META: Record<
  HandbookToolStatus,
  { label: string; className: string }
> = {
  supported: { label: 'Direct support', className: 'ed-badge--success' },
  converted: { label: 'Protocol conversion', className: 'ed-badge--accent' },
  limited: { label: 'Limited support', className: 'ed-badge--warning' },
  unsupported: { label: 'Not recommended', className: 'ed-badge--danger' },
  other: { label: 'Helper tool', className: '' },
}

function ToolCard(props: { tool: HandbookTool; onOpen: () => void }) {
  const { t } = useTranslation()
  const meta = STATUS_META[props.tool.status]
  return (
    <button type='button' className='ed-toolCard' onClick={props.onOpen}>
      <span className='ed-toolCardHead'>
        <strong>{props.tool.name}</strong>
        <span className={cn('ed-badge', meta.className)}>{t(meta.label)}</span>
      </span>
      {props.tool.summary ? <p>{props.tool.summary}</p> : null}
      <span className='ed-toolCardMore'>{t('View setup steps')} →</span>
    </button>
  )
}

function Collapsible(props: {
  id: string
  title: string
  body: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen))
  return (
    <section className='ed-panel' id={props.id}>
      <button
        type='button'
        className='ed-panelHead ed-collapsibleHead'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <h2>{props.title}</h2>
        <ChevronDown
          size={18}
          aria-hidden='true'
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className='ed-panelBody ed-handbook'>
          <Markdown>{props.body}</Markdown>
        </div>
      ) : null}
    </section>
  )
}

/** Documentation page: the tool handbook presented as a card wall. */
export function GuidePage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [active, setActive] = useState<HandbookTool | null>(null)
  const needle = query.trim().toLowerCase()

  const categories = useMemo(() => {
    return handbook.categories
      .filter((category) => categoryId === 'all' || category.id === categoryId)
      .map((category) => ({
        ...category,
        tools: category.tools.filter(
          (tool) =>
            !needle ||
            tool.name.toLowerCase().includes(needle) ||
            tool.summary.toLowerCase().includes(needle) ||
            tool.body.toLowerCase().includes(needle)
        ),
      }))
      .filter((category) => category.tools.length > 0)
  }, [categoryId, needle])
  const activeMeta = active ? STATUS_META[active.status] : null

  return (
    <div className='ed-docs' data-testid='guide-shell'>
      <div className='ed-page ed-page--wide'>
        <header className='ed-pageHead'>
          <div>
            <p className='ed-eyebrow'>{t('Developer docs')}</p>
            <h1 className='ed-display'>{handbook.title}</h1>
            <p>
              {t(
                'Step-by-step setup and error lookup for every popular client, from chat apps to coding agents and workflow platforms.'
              )}
            </p>
          </div>
        </header>

        <div className='ed-pageBody'>
          <Collapsible
            id='intro'
            title={t('Before you start: the three values every tool needs')}
            body={handbook.intro}
            defaultOpen
          />

          <section className='ed-panel' id='tools'>
            <header className='ed-panelHead'>
              <div>
                <h2>{t('Pick your tool, follow the steps')}</h2>
                <p>
                  {t(
                    'Click any card for step-by-step setup, cautions and a quick error lookup.'
                  )}
                </p>
              </div>
              <label className='ed-docsSearch'>
                <Search size={14} aria-hidden='true' />
                <input
                  type='search'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t('Search documentation')}
                  placeholder={t('Search tools or errors')}
                />
                {query ? (
                  <button
                    type='button'
                    aria-label={t('Clear filters')}
                    onClick={() => setQuery('')}
                  >
                    <X size={14} aria-hidden='true' />
                  </button>
                ) : null}
              </label>
            </header>
            <div className='ed-panelBody'>
              <div
                className='ed-chipRow'
                role='tablist'
                aria-label={t('Tool categories')}
              >
                <button
                  type='button'
                  role='tab'
                  aria-selected={categoryId === 'all'}
                  className='ed-chip'
                  onClick={() => setCategoryId('all')}
                >
                  {t('All')}
                </button>
                {handbook.categories.map((category) => (
                  <button
                    key={category.id}
                    type='button'
                    role='tab'
                    aria-selected={categoryId === category.id}
                    className='ed-chip'
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.title}
                    <span>{category.tools.length}</span>
                  </button>
                ))}
              </div>

              {categories.length === 0 ? (
                <div className='ed-empty'>
                  <p>{t('No matching docs')}</p>
                </div>
              ) : null}

              {categories.map((category) => (
                <div key={category.id} className='ed-toolGroup'>
                  <h3 className='ed-toolGroupTitle'>{category.title}</h3>
                  <div className='ed-toolGrid'>
                    {category.tools.map((tool) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        onOpen={() => setActive(tool)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {handbook.chapters.map((chapter) => (
            <Collapsible
              key={chapter.id}
              id={chapter.id}
              title={chapter.title}
              body={chapter.body}
            />
          ))}
        </div>
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className='max-h-[88vh] gap-0 overflow-y-auto sm:max-w-3xl'>
          {active && activeMeta ? (
            <>
              <DialogHeader className='pb-3'>
                <DialogTitle className='ed-display flex flex-wrap items-center gap-2.5 text-2xl'>
                  {active.name}
                  <span className={cn('ed-badge', activeMeta.className)}>
                    {t(activeMeta.label)}
                  </span>
                </DialogTitle>
                {active.summary ? (
                  <DialogDescription>{active.summary}</DialogDescription>
                ) : null}
              </DialogHeader>
              <div className='ed-handbook ed-handbook--dialog'>
                <Markdown>{active.body}</Markdown>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
