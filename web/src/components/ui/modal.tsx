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
import { X } from 'lucide-react'
import { useEffect, useId } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

const WIDTHS = { md: 'max-w-[480px]', lg: 'max-w-[640px]', xl: 'max-w-[880px]' }

/**
 * A dialog over the page: named by its title, closed by Escape, the close
 * button or a click outside. The body scrolls; the footer (buttons) stays put.
 */
export function Modal(props: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: keyof typeof WIDTHS
}) {
  const { t } = useI18n()
  const titleId = useId()
  const onClose = props.onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className='fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        className={cn('border-or-line bg-or-card text-or-fg flex max-h-[90vh] w-full flex-col rounded-[12px] border shadow-2xl', WIDTHS[props.size ?? 'md'])}
      >
        <header className='flex items-start justify-between gap-4 px-6 pt-5 pb-4'>
          <h2 id={titleId} className='text-[16px] font-semibold'>
            {props.title}
          </h2>
          <button
            type='button'
            onClick={onClose}
            aria-label={t('关闭')}
            className='text-or-muted hover:bg-or-fill -mr-2 flex size-7 shrink-0 items-center justify-center rounded-[6px]'
          >
            <X className='size-4' aria-hidden='true' />
          </button>
        </header>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 pb-5'>{props.children}</div>
        {props.footer ? <footer className='border-or-line flex justify-end gap-2 border-t px-6 py-4'>{props.footer}</footer> : null}
      </div>
    </div>
  )
}
