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
import { Check, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { LANGUAGES, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/** Globe button with the language list; the choice is remembered. */
export function LanguageMenu(props: { className?: string; iconClassName?: string }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className='relative'>
      <button
        type='button'
        aria-label={t('切换语言')}
        title={t('切换语言')}
        aria-haspopup='menu'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={props.className}
      >
        <Globe className={cn('size-4', props.iconClassName)} aria-hidden='true' />
      </button>
      {open ? (
        <div
          role='menu'
          className='border-or-line bg-or-card absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-[8px] border p-1 shadow-xl'
        >
          {LANGUAGES.map((option) => (
            <button
              key={option.id}
              type='button'
              role='menuitemradio'
              aria-checked={lang === option.id}
              onClick={() => {
                setLang(option.id)
                setOpen(false)
              }}
              className='text-or-fg hover:bg-or-fill flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[14px]'
            >
              {option.label}
              {lang === option.id ? <Check className='text-or-primary size-4' aria-hidden='true' /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
