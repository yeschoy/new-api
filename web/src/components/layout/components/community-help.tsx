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
import { MessagesSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPPORT_QQ_GROUP } from '@/lib/support-contact'
import { cn } from '@/lib/utils'

type CommunityHelpVariant = 'console' | 'header'

type CommunityHelpProps = {
  /**
   * `console` renders a compact outline pill for dense toolbars; `header`
   * renders the solid accent action whose label collapses on phones.
   */
  variant?: CommunityHelpVariant
}

export function CommunityHelp(props: CommunityHelpProps = {}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const isHeader = props.variant === 'header'
  const label = t('Community')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className='ed-help' ref={rootRef}>
      <button
        type='button'
        className={cn(
          'ed-communityTrigger',
          isHeader
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary px-3 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
            : 'ed-btn ed-btn--outline ed-btn--xs'
        )}
        aria-expanded={open}
        aria-label={isHeader ? label : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {isHeader ? (
          <MessagesSquare className='size-4 shrink-0' aria-hidden='true' />
        ) : null}
        <span className={isHeader ? 'hidden whitespace-nowrap sm:inline' : ''}>
          {label}
        </span>
      </button>
      {open ? (
        <div className='ed-helpPanel' role='dialog' aria-label={label}>
          <img
            src='/qq-community-qr.png'
            alt={t('QQ after-sales group QR code')}
            width={176}
            height={176}
          />
          <strong>{t('QQ group: {{group}}', { group: SUPPORT_QQ_GROUP })}</strong>
          <p>{t('Scan to join the QQ group for setup help.')}</p>
        </div>
      ) : null}
    </div>
  )
}
