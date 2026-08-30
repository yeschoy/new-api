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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { GUIDE_TOOLS, TOOL_STATUS_LABEL_KEYS } from '../constants'
import { filterGuideTools } from '../lib/filters'
import type { ToolStatus, UseCaseId } from '../types'

const STATUS_BADGE_CLASS: Record<ToolStatus, string> = {
  ready:
    'h-auto max-w-full whitespace-normal border-success/40 bg-success/15 text-success dark:bg-success/20',
  config:
    'h-auto max-w-full whitespace-normal border-warning/50 bg-warning/15 text-warning dark:bg-warning/20',
  protocol:
    'h-auto max-w-full whitespace-normal border-info/40 bg-info/15 text-info dark:bg-info/20',
  blocked:
    'h-auto max-w-full whitespace-normal border-border bg-muted text-muted-foreground',
}

type ToolListProps = {
  useCase: UseCaseId | 'all'
}

export function ToolList(props: ToolListProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const tools = useMemo(
    () => filterGuideTools(GUIDE_TOOLS, props.useCase, query),
    [props.useCase, query]
  )

  return (
    <section>
      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 className='font-serif text-2xl tracking-tight'>
            {t('Matching apps')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Green can connect directly. Yellow needs a file or has limits. Blue needs another protocol. Gray cannot set a custom Base URL.'
            )}
          </p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('Search an app name')}
          aria-label={t('Search an app name')}
          className='sm:max-w-56'
        />
      </div>

      {tools.length === 0 ? (
        <p
          data-empty-tools
          className='text-muted-foreground rounded-2xl border px-4 py-8 text-center text-sm'
        >
          {t('No matching apps. Try another use case or search.')}
        </p>
      ) : (
        <Accordion className='divide-border bg-card/70 overflow-hidden rounded-2xl border'>
          {tools.map((tool) => (
            <AccordionItem
              key={tool.id}
              value={tool.id}
              id={`tool-${tool.id}`}
              className='scroll-mt-24 px-4'
              data-tool={tool.id}
            >
              <AccordionTrigger className='hover:no-underline'>
                <span className='flex min-w-0 flex-1 flex-col items-start gap-1.5 pe-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2'>
                  <span className='max-w-full truncate font-medium'>
                    {tool.name}
                  </span>
                  <span className='flex max-w-full min-w-0 flex-wrap items-center gap-1.5'>
                    {tool.beginnerPick ? (
                      <Badge
                        variant='secondary'
                        className='h-auto max-w-full whitespace-normal'
                      >
                        {t('Recommended for beginners')}
                      </Badge>
                    ) : null}
                    <Badge
                      variant='outline'
                      className={cn(STATUS_BADGE_CLASS[tool.status])}
                    >
                      {t(TOOL_STATUS_LABEL_KEYS[tool.status])}
                    </Badge>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className='text-muted-foreground grid gap-3 pb-3 text-sm'>
                  <p>
                    <span className='text-foreground font-medium'>
                      {t('How to fill it in')}:
                    </span>{' '}
                    {t(tool.fillKey)}
                  </p>
                  <p>{t(tool.noteKey)}</p>
                  <ol className='grid list-decimal gap-1.5 ps-5'>
                    {tool.steps.map((step) => (
                      <li key={step}>{t(step)}</li>
                    ))}
                  </ol>
                  <p>
                    <span className='text-foreground font-medium'>
                      {t('Most common mistake')}:
                    </span>{' '}
                    {t(tool.mistakeKey)}
                  </p>
                  <p>
                    <span className='text-foreground font-medium'>
                      {t('If it works')}:
                    </span>{' '}
                    {t(tool.successKey)}
                  </p>
                  {tool.siteUrl || tool.docsUrl ? (
                    <p className='flex flex-wrap gap-x-4 gap-y-1'>
                      {tool.siteUrl ? (
                        <a
                          href={tool.siteUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary w-fit underline underline-offset-4'
                        >
                          {t('App website')}
                        </a>
                      ) : null}
                      {tool.docsUrl ? (
                        <a
                          href={tool.docsUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary w-fit underline underline-offset-4'
                        >
                          {t('Official reference')}
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  )
}
