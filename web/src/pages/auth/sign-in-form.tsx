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
import { Link } from 'react-router'

import { AuthField } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { passwordSignIn } from './auth-api'
import { AuthMessage, OrDivider, PrimaryButton } from './auth-parts'
import type { AuthStatus } from './auth-status'
import { LegalConsent, needsLegalConsent } from './legal-consent'
import { thirdPartyAvailable } from './oauth-providers'
import { ThirdPartySignIn } from './third-party-sign-in'
import { useTurnstile } from './turnstile'

/** The first sign-in step: third-party options first (as on openrouter.ai), then the password form. */
export function SignInForm(props: {
  status: AuthStatus | undefined
  redirect: string
  onTwoFactor: (flowToken: string) => void
  onSignedIn: () => void
}) {
  const { t } = useI18n()
  const turnstile = useTurnstile()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const status = props.status
  const consent = needsLegalConsent(status)
  const blocked = consent && !agreed
  const passwordOn = status?.password_login_enabled !== false
  const thirdParty = thirdPartyAvailable(status, true)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!turnstile.ready) return setError(t('请先完成人机验证'))
    setBusy(true)
    try {
      const result = await passwordSignIn({
        username,
        password,
        encrypt: Boolean(status?.password_login_encryption_enabled),
        turnstile: turnstile.token,
      })
      if (result.kind === 'signed-in') props.onSignedIn()
      else if (result.kind === 'error') setError(result.message)
      else if (result.flowToken) props.onTwoFactor(result.flowToken)
      else setError(t('登录已过期，请重新登录'))
    } catch (err) {
      setError(errorMessage(err, t('登录失败')))
    } finally {
      setBusy(false)
      turnstile.reset()
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      {thirdParty ? (
        <ThirdPartySignIn status={status} redirect={props.redirect} disabled={blocked} passkey onSignedIn={props.onSignedIn} />
      ) : null}
      {thirdParty && passwordOn ? <OrDivider /> : null}
      {passwordOn ? (
        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          <AuthField label={t('用户名或邮箱')} value={username} onChange={setUsername} autoComplete='username' placeholder={t('请输入用户名或邮箱')} required />
          <div className='flex flex-col gap-1.5'>
            <AuthField label={t('密码')} type='password' value={password} onChange={setPassword} autoComplete='current-password' placeholder={t('请输入密码')} required />
            <Link to='/forgot-password' className='text-or-muted hover:text-or-fg self-end text-[13px]'>
              {t('忘记密码？')}
            </Link>
          </div>
          {turnstile.widget}
          {turnstile.misconfigured ? (
            <p className='text-or-dim text-center text-[12px]'>{t('本站开启了人机验证，如登录失败请联系管理员。')}</p>
          ) : null}
          {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
          <PrimaryButton busy={busy} disabled={blocked}>
            {t('继续')}
          </PrimaryButton>
        </form>
      ) : null}
      {status && !passwordOn && !thirdParty ? <AuthMessage tone='error'>{t('管理员已关闭所有登录方式，请联系管理员。')}</AuthMessage> : null}
      {consent ? <LegalConsent status={status} checked={agreed} onChange={setAgreed} /> : null}
    </div>
  )
}
