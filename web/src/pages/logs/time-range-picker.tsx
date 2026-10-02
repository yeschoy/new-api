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
import { CalendarDays } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button, Field, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { PRESET_DAYS, RANGE_PRESETS, fromInputValue, presetRange, rangeLabel, toInputValue, type TimeRange } from './time-range'

/**
 * A compact time window field: the button shows the window, the panel under
 * it edits start and end to the minute or picks a preset. Escape or a click
 * outside closes it without changes.
 */
export function TimeRangePicker(props: { value: TimeRange; onChange: (range: TimeRange) => void }) {
  const { t } = useI18n()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) {
      setStart(toInputValue(props.value.start))
      setEnd(toInputValue(props.value.end))
    }
    setOpen(!open)
  }
  const confirm = () => {
    props.onChange({ start: fromInputValue(start), end: fromInputValue(end) })
    setOpen(false)
  }
  const label = rangeLabel(props.value.start, props.value.end, new Date())

  return (
    <div ref={box} className='relative min-w-0'>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup='dialog'
        aria-label={`${t('时间范围')}: ${label}`}
        className='border-or-line bg-or-bg text-or-fg hover:bg-or-fill flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] border px-3 text-left text-[14px] tabular-nums transition-colors'
      >
        <CalendarDays className='text-or-muted size-4 shrink-0' aria-hidden='true' />
        <span className='truncate'>{label}</span>
      </button>
      {open ? (
        <div
          role='dialog'
          aria-label={t('时间范围')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              confirm()
            }
          }}
          className='border-or-line bg-or-card absolute top-full left-0 z-30 mt-1 w-[min(440px,calc(100vw-48px))] rounded-[8px] border p-3 shadow-xl'
        >
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={t('开始时间')} htmlFor={`${id}-start`}>
              <TextInput id={`${id}-start`} type='datetime-local' value={start} onChange={setStart} className='text-[13px]' />
            </Field>
            <Field label={t('结束时间')} htmlFor={`${id}-end`}>
              <TextInput id={`${id}-end`} type='datetime-local' value={end} onChange={setEnd} className='text-[13px]' />
            </Field>
          </div>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                size='sm'
                className='flex-1'
                onClick={() => {
                  props.onChange(presetRange(preset.id, new Date()))
                  setOpen(false)
                }}
              >
                {t(preset.label, { days: PRESET_DAYS[preset.id] ?? 0 })}
              </Button>
            ))}
          </div>
          <div className='mt-3 flex justify-end'>
            <Button size='sm' variant='primary' onClick={confirm}>
              {t('确认')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
