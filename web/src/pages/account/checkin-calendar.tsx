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
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui'
import { localeOf, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/** YYYY-MM-DD in local time, the format of the check-in records. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The days of `month` (its first day), padded to whole weeks starting on Sunday. */
function monthGrid(month: Date): Array<Date | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= days; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day))
  while (cells.length % 7) cells.push(null)
  return cells
}

/** A month of check-ins: checked days carry a dot and their reward as a tooltip. */
export function CheckinCalendar(props: {
  month: Date
  awards: Map<string, string>
  onMonth: (month: Date) => void
}) {
  const { t, lang } = useI18n()
  const locale = localeOf(lang)
  const today = localDay(new Date())
  // 1 January 2023 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2023, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' }))
  const shift = (step: number) => props.onMonth(new Date(props.month.getFullYear(), props.month.getMonth() + step, 1))

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <span className='text-[14px] font-medium'>{props.month.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}</span>
        <div className='flex gap-1'>
          <Button size='sm' variant='ghost' ariaLabel={t('上个月')} onClick={() => shift(-1)}>
            <ChevronLeft className='size-4' aria-hidden='true' />
          </Button>
          <Button size='sm' variant='ghost' ariaLabel={t('下个月')} onClick={() => shift(1)}>
            <ChevronRight className='size-4' aria-hidden='true' />
          </Button>
        </div>
      </div>
      <div className='grid grid-cols-7 gap-1 text-center text-[13px]'>
        {weekdays.map((day, index) => (
          <span key={index} className='text-or-dim py-1 text-[12px]'>
            {day}
          </span>
        ))}
        {monthGrid(props.month).map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />
          const key = localDay(date)
          const award = props.awards.get(key)
          return (
            <span
              key={key}
              title={award ? `+${award}` : undefined}
              className={cn(
                'relative flex h-9 items-center justify-center rounded-[6px] tabular-nums',
                key === today ? 'bg-or-primary text-or-bg font-semibold' : 'text-or-fg',
                award && key !== today ? 'bg-or-primary-soft font-semibold' : null
              )}
            >
              {date.getDate()}
              {award ? <span className='bg-or-primary absolute bottom-1 size-1 rounded-full' aria-hidden='true' /> : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
