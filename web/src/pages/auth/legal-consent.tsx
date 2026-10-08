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
import { useId } from 'react'

import { useI18n } from '@/i18n/i18n'

import { AUTH_LINK } from './auth-parts'
import type { AuthStatus } from './auth-status'

/** Signing in or up waits for the visitor to accept the terms the administrator published. */
export function needsLegalConsent(status: AuthStatus | undefined): boolean {
  return Boolean(status?.user_agreement_enabled || status?.privacy_policy_enabled)
}

export function LegalConsent(props: { status: AuthStatus | undefined; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useI18n()
  const id = useId()
  const agreement = Boolean(props.status?.user_agreement_enabled)
  const privacy = Boolean(props.status?.privacy_policy_enabled)
  return (
    <div className='text-or-muted flex items-start gap-2 text-[13px] leading-5'>
      <input
        id={id}
        type='checkbox'
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className='accent-or-primary mt-0.5 size-4 shrink-0'
      />
      <label htmlFor={id}>
        {t('我已阅读并同意')}{' '}
        {agreement ? (
          <a href='/user-agreement' target='_blank' rel='noopener noreferrer' className={AUTH_LINK}>
            {t('用户协议')}
          </a>
        ) : null}
        {agreement && privacy ? ` ${t('和')} ` : null}
        {privacy ? (
          <a href='/privacy-policy' target='_blank' rel='noopener noreferrer' className={AUTH_LINK}>
            {t('隐私政策')}
          </a>
        ) : null}
      </label>
    </div>
  )
}
