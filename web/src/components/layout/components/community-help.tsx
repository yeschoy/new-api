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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function CommunityHelp() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
    <div className='ci-appHelp' ref={rootRef}>
      <button
        type='button'
        className='ci-button ci-button--lime ci-button--size-xs'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('Get Help')}
      </button>
      {open ? (
        <div
          className='ci-appHelpPanel'
          role='dialog'
          aria-label={t('Get Help')}
        >
          <img
            src='/qq-community-qr.png'
            alt={t('QQ after-sales group QR code')}
            width={180}
            height={180}
          />
          <strong>{t('QQ group: 1065665694')}</strong>
          <p>{t('Scan to join the QQ group for setup help.')}</p>
        </div>
      ) : null}
    </div>
  )
}
