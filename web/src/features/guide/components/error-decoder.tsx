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

import { Input } from '@/components/ui/input'

import { SAFETY_KEYS } from '../constants'
import { filterErrorRows } from '../lib/filters'

export function ErrorDecoder() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => filterErrorRows(query), [query])

  return (
    <section className='grid gap-8'>
      <div>
        <h2 className='font-serif text-2xl tracking-tight'>
          {t('If something goes wrong')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('Do not panic. Match the message, then try the first fix.')}
        </p>
        <Input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('Search an error, such as 404 or 401')}
          aria-label={t('Search an error, such as 404 or 401')}
          className='mt-4 max-w-md'
        />
      </div>

      {rows.length === 0 ? (
        <p data-empty-errors className='text-muted-foreground text-sm'>
          {t('No matching errors. Try 401, 404, 429, or timeout.')}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-2xl border'>
          <table className='w-full min-w-[40rem] text-sm'>
            <thead className='bg-muted/60 text-left'>
              <tr>
                <th className='px-4 py-3 font-medium'>{t('What you see')}</th>
                <th className='px-4 py-3 font-medium'>
                  {t('What it actually means')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('What to try first')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-error-row={row.id} className='border-t'>
                  <td className='px-4 py-3 font-mono text-xs sm:text-sm'>
                    {t(row.symptomKey)}
                  </td>
                  <td className='text-muted-foreground px-4 py-3'>
                    {t(row.meaningKey)}
                  </td>
                  <td className='px-4 py-3'>{t(row.actionKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className='bg-card/70 rounded-2xl border p-5'>
        <h3 className='font-serif text-xl tracking-tight'>
          {t('Safety and cost')}
        </h3>
        <ul className='mt-3 grid list-disc gap-2 ps-5 text-sm leading-relaxed'>
          {SAFETY_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
