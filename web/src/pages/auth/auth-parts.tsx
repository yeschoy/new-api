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
import { Loader2 } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/** Inline links in the auth cards. */
export const AUTH_LINK = 'text-or-fg font-medium hover:underline'

/** The auth card's full-width primary button, which can also wait (a countdown, an unticked consent). */
export function PrimaryButton(props: {
  children: React.ReactNode
  busy?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
}) {
  return (
    <button
      type={props.type ?? 'submit'}
      onClick={props.onClick}
      disabled={props.busy || props.disabled}
      className='bg-or-primary text-or-bg flex h-10 w-full items-center justify-center gap-2 rounded-[6px] text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60'
    >
      {props.busy ? <Loader2 className='size-4 animate-spin' aria-hidden='true' /> : null}
      {props.children}
    </button>
  )
}

/** One line of feedback under a form: errors are announced at once. */
export function AuthMessage(props: { tone: 'error' | 'success'; children: React.ReactNode }) {
  if (props.tone === 'error') return <p role='alert' className='text-or-red text-[13px]'>{props.children}</p>
  return <p role='status' className='text-or-primary text-[13px]'>{props.children}</p>
}

/** "或" between the third-party buttons and the password form. */
export function OrDivider(props: { className?: string }) {
  const { t } = useI18n()
  return (
    <div className={cn('text-or-dim flex items-center gap-3 text-[12px]', props.className)}>
      <span className='bg-or-line h-px flex-1' />
      {t('或')}
      <span className='bg-or-line h-px flex-1' />
    </div>
  )
}
