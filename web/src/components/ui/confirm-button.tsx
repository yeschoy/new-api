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
import { useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { Button } from '@/pages/console/console-ui'

/** A button that asks in place before it acts (delete, reset, disable). */
export function ConfirmButton(props: {
  children: React.ReactNode
  /** The question shown in place of the button, already translated, e.g. t('确认删除？'). */
  question: string
  onConfirm: () => void
  busy?: boolean
  size?: 'sm' | 'md'
  variant?: 'danger' | 'primary' | 'secondary'
}) {
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button size={props.size ?? 'sm'} variant='ghost' busy={props.busy} onClick={() => setAsking(true)}>
        {props.children}
      </Button>
    )
  }
  return (
    <span className='inline-flex items-center gap-1'>
      <span className='text-or-muted mr-1 text-[13px] whitespace-nowrap'>{props.question}</span>
      <Button
        size={props.size ?? 'sm'}
        variant={props.variant ?? 'danger'}
        busy={props.busy}
        onClick={() => {
          setAsking(false)
          props.onConfirm()
        }}
      >
        {t('确认')}
      </Button>
      <Button size={props.size ?? 'sm'} variant='ghost' onClick={() => setAsking(false)}>
        {t('取消')}
      </Button>
    </span>
  )
}
