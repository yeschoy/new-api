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
import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { AuthCard } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'

import { AUTH_LINK, OrDivider } from './auth-parts'
import { useAuthStatus } from './auth-status'
import { rememberInviteCode } from './invite-code'
import { LegalConsent, needsLegalConsent } from './legal-consent'
import { thirdPartyAvailable } from './oauth-providers'
import { safeRedirect } from './sign-in-page'
import { SignUpForm } from './sign-up-form'
import { ThirdPartySignIn } from './third-party-sign-in'
import { useFinishSignIn } from './use-finish-sign-in'

export function SignUpPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const finish = useFinishSignIn()
  const [params] = useSearchParams()
  const status = useAuthStatus()
  const [agreed, setAgreed] = useState(false)
  const redirect = safeRedirect(params.get('redirect'))
  const linkInviteCode = params.get('aff')?.trim() ?? ''

  useEffect(() => {
    if (linkInviteCode) rememberInviteCode(linkInviteCode)
  }, [linkInviteCode])

  if (auth.status === 'authenticated') return <Navigate to={redirect} replace />

  const passwordOn = status?.password_register_enabled !== false
  const thirdParty = thirdPartyAvailable(status, false)
  if (status && (status.register_enabled === false || (!passwordOn && !thirdParty))) {
    return (
      <AuthCard title={t('注册')} subtitle={t('管理员已关闭新用户注册。')}>
        <Link to='/sign-in' className='text-or-fg block text-center underline'>
          {t('返回登录')}
        </Link>
      </AuthCard>
    )
  }

  const consent = needsLegalConsent(status)
  const blocked = consent && !agreed

  return (
    <AuthCard
      title={t('注册')}
      footer={
        <>
          {t('已有账号？')}{' '}
          <Link to={`/sign-in?redirect=${encodeURIComponent(redirect)}`} className={AUTH_LINK}>
            {t('登录')}
          </Link>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        {thirdParty ? (
          <ThirdPartySignIn status={status} redirect={redirect} disabled={blocked} passkey={false} onSignedIn={() => finish(redirect)} />
        ) : null}
        {thirdParty && passwordOn ? <OrDivider /> : null}
        {passwordOn ? <SignUpForm redirect={redirect} inviteCode={linkInviteCode} blocked={blocked} onSignedIn={() => finish(redirect)} /> : null}
        {consent ? <LegalConsent status={status} checked={agreed} onChange={setAgreed} /> : null}
      </div>
    </AuthCard>
  )
}
