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
import { useNavigate } from 'react-router'

import { AuthField } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useCountdown } from '@/pages/account/account-ui'

import { sendVerificationEmail, signUp } from './auth-api'
import { AuthMessage, PrimaryButton } from './auth-parts'
import { useAuthStatus } from './auth-status'
import { rememberedInviteCode } from './invite-code'
import { useTurnstile } from './turnstile'

/** Seconds before another email code may be requested. */
const RESEND_SECONDS = 30

/** Password sign-up; the email and its code are asked for when the site verifies addresses. */
export function SignUpForm(props: { redirect: string; inviteCode: string; blocked: boolean; onSignedIn: () => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const status = useAuthStatus()
  const turnstile = useTurnstile()
  const countdown = useCountdown()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const needsEmail = Boolean(status?.email_verification)

  async function sendCode() {
    setError('')
    setNotice('')
    if (!email) return setError(t('请先填写邮箱'))
    if (!turnstile.ready) return setError(t('请先完成人机验证'))
    setSending(true)
    try {
      await sendVerificationEmail(email, turnstile.token)
      setNotice(t('验证码已发送，请查收邮件'))
      countdown.start(RESEND_SECONDS)
    } catch (err) {
      setError(errorMessage(err, t('发送失败')))
    } finally {
      setSending(false)
      turnstile.reset()
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError(t('密码至少 8 位'))
    if (password.length > 20) return setError(t('密码最多 20 位'))
    if (password !== confirm) return setError(t('两次输入的密码不一致'))
    if (!turnstile.ready) return setError(t('请先完成人机验证'))
    setBusy(true)
    const inviteCode = props.inviteCode || rememberedInviteCode()
    try {
      const result = await signUp(
        {
          username,
          password,
          ...(needsEmail ? { email, verification_code: code } : {}),
          ...(inviteCode ? { aff_code: inviteCode } : {}),
        },
        turnstile.token
      )
      if (result.kind === 'signed-in') props.onSignedIn()
      else if (result.kind === 'registered') navigate(`/sign-in?redirect=${encodeURIComponent(props.redirect)}`, { replace: true })
      else if (result.kind === 'error') setError(result.message)
    } catch (err) {
      setError(errorMessage(err, t('注册失败')))
    } finally {
      setBusy(false)
      turnstile.reset()
    }
  }

  return (
    <form onSubmit={onSubmit} className='flex flex-col gap-4'>
      <AuthField label={t('用户名')} value={username} onChange={setUsername} autoComplete='username' placeholder={t('3–20 个字符')} required />
      {needsEmail ? (
        <>
          <AuthField label={t('邮箱')} type='email' value={email} onChange={setEmail} autoComplete='email' placeholder='name@example.com' required />
          <div className='flex items-end gap-2'>
            <div className='min-w-0 flex-1'>
              <AuthField label={t('邮箱验证码')} value={code} onChange={setCode} autoComplete='one-time-code' required />
            </div>
            <button
              type='button'
              onClick={sendCode}
              disabled={sending || countdown.left > 0}
              className='border-or-line hover:bg-or-fill h-10 shrink-0 rounded-[6px] border px-3 text-[14px] disabled:cursor-not-allowed disabled:opacity-60'
            >
              {countdown.left > 0 ? t('{seconds} 秒后可重新发送', { seconds: countdown.left }) : t('发送验证码')}
            </button>
          </div>
        </>
      ) : null}
      <AuthField label={t('密码')} type='password' value={password} onChange={setPassword} autoComplete='new-password' placeholder={t('至少 8 位')} required />
      <AuthField label={t('确认密码')} type='password' value={confirm} onChange={setConfirm} autoComplete='new-password' required />
      {turnstile.widget}
      {notice ? <AuthMessage tone='success'>{notice}</AuthMessage> : null}
      {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
      <PrimaryButton busy={busy} disabled={props.blocked}>
        {t('创建账号')}
      </PrimaryButton>
    </form>
  )
}
