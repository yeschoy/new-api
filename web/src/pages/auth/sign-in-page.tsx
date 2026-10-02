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
import { Link, Navigate, useSearchParams } from 'react-router'

import { AuthCard } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'

import { AUTH_LINK } from './auth-parts'
import { useAuthStatus, type AuthStatus } from './auth-status'
import { thirdPartyAvailable } from './oauth-providers'
import { SignInForm } from './sign-in-form'
import { TwoFactorStep } from './two-factor-step'
import { useFinishSignIn } from './use-finish-sign-in'

/** Only same-site paths are accepted as post-login destinations. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/settings/keys'
  return value
}

/** Sign-up is offered unless closed, in self-use mode, or no way to create an account is on. */
function signUpOpen(status: AuthStatus | undefined): boolean {
  if (status?.register_enabled === false || status?.self_use_mode_enabled) return false
  return status?.password_register_enabled !== false || thirdPartyAvailable(status, false)
}

export function SignInPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const [params] = useSearchParams()
  const status = useAuthStatus()
  const finish = useFinishSignIn()
  const [flowToken, setFlowToken] = useState('')
  const redirect = safeRedirect(params.get('redirect'))

  if (auth.status === 'authenticated') return <Navigate to={redirect} replace />

  if (flowToken) {
    return <TwoFactorStep flowToken={flowToken} onBack={() => setFlowToken('')} onSignedIn={() => finish(redirect)} />
  }

  return (
    <AuthCard
      title={t('登录')}
      footer={
        signUpOpen(status) ? (
          <>
            {t('还没有账号？')}{' '}
            <Link to={`/sign-up?redirect=${encodeURIComponent(redirect)}`} className={AUTH_LINK}>
              {t('注册')}
            </Link>
          </>
        ) : null
      }
    >
      <SignInForm status={status} redirect={redirect} onTwoFactor={setFlowToken} onSignedIn={() => finish(redirect)} />
    </AuthCard>
  )
}
