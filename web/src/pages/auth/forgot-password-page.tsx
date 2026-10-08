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

import { AuthCard, AuthField } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useCountdown } from '@/pages/account/account-ui'

import { sendResetEmail } from './auth-api'
import { AUTH_LINK, AuthMessage, PrimaryButton } from './auth-parts'
import { useTurnstile } from './turnstile'

/** Seconds before another reset email may be requested. */
const RESEND_SECONDS = 30

/** Mails a password reset link (GET /api/reset_password). */
export function ForgotPasswordPage() {
  const { t } = useI18n()
  const turnstile = useTurnstile()
  const countdown = useCountdown()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!turnstile.ready) return setError(t('请先完成人机验证'))
    setBusy(true)
    try {
      await sendResetEmail(email.trim(), turnstile.token)
      setSent(true)
      countdown.start(RESEND_SECONDS)
    } catch (err) {
      setSent(false)
      setError(errorMessage(err, t('发送失败')))
    } finally {
      setBusy(false)
      turnstile.reset()
    }
  }

  return (
    <AuthCard
      title={t('找回密码')}
      subtitle={t('输入注册邮箱，我们会发送一封重置密码的邮件。')}
      footer={
        <>
          {t('想起密码了？')}{' '}
          <Link to='/sign-in' className={AUTH_LINK}>
            {t('返回登录')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <AuthField label={t('邮箱')} type='email' value={email} onChange={setEmail} autoComplete='email' placeholder='name@example.com' required />
        {turnstile.widget}
        {sent ? <AuthMessage tone='success'>{t('如果该邮箱已注册，重置邮件已发出，请查收。')}</AuthMessage> : null}
        {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
        <PrimaryButton busy={busy} disabled={countdown.left > 0}>
          {countdown.left > 0 ? t('{seconds} 秒后可重新发送', { seconds: countdown.left }) : t('发送重置邮件')}
        </PrimaryButton>
      </form>
    </AuthCard>
  )
}
