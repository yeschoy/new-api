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
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'

import { AuthCard, AuthField, AuthSubmit } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { api, errorMessage, type ApiEnvelope } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { useStatus } from '@/lib/queries'
import { register } from '@/lib/services'

import { safeRedirect } from './sign-in-page'

/** Where an invite code waits, under the old site's key, in case the visitor leaves and comes back to sign up. */
const INVITE_KEY = 'aff'

function rememberedInviteCode(): string {
  try {
    return window.localStorage.getItem(INVITE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function SignUpPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: status } = useStatus()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const redirect = safeRedirect(params.get('redirect'))
  const needsEmail = Boolean(status?.email_verification)
  const linkInviteCode = params.get('aff')?.trim() ?? ''

  useEffect(() => {
    if (!linkInviteCode) return
    try {
      window.localStorage.setItem(INVITE_KEY, linkInviteCode)
    } catch {
      // Storage disabled: the code in the address is still sent below.
    }
  }, [linkInviteCode])

  if (auth.status === 'authenticated') return <Navigate to={redirect} replace />

  const sendCode = async () => {
    setError('')
    setNotice('')
    if (!email) return setError(t('请先填写邮箱'))
    try {
      const res = await api.get<ApiEnvelope<unknown>>('/api/verification', { params: { email } })
      if (res.data.success) setNotice(t('验证码已发送，请查收邮件'))
      else setError(res.data.message || t('发送失败'))
    } catch (err) {
      setError(errorMessage(err, t('发送失败')))
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError(t('密码至少 8 位'))
    if (password !== confirm) return setError(t('两次输入的密码不一致'))
    setBusy(true)
    const inviteCode = linkInviteCode || rememberedInviteCode()
    try {
      const result = await register({
        username,
        password,
        ...(needsEmail ? { email, verification_code: code } : {}),
        ...(inviteCode ? { aff_code: inviteCode } : {}),
      })
      if (result.kind === 'signed-in') navigate(redirect, { replace: true })
      else if (result.kind === 'registered') navigate(`/sign-in?redirect=${encodeURIComponent(redirect)}`, { replace: true })
      else if (result.kind === 'error') setError(result.message)
    } catch (err) {
      setError(errorMessage(err, t('注册失败')))
    } finally {
      setBusy(false)
    }
  }

  if (status && (status.register_enabled === false || status.password_register_enabled === false)) {
    return (
      <AuthCard title={t('注册')} subtitle={t('管理员已关闭新用户注册。')}>
        <Link to='/sign-in' className='text-or-fg block text-center underline'>{t('返回登录')}</Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('注册')}
      footer={
        <>
          {t('已有账号？')}{' '}
          <Link to={`/sign-in?redirect=${encodeURIComponent(redirect)}`} className='text-or-fg font-medium hover:underline'>
            {t('登录')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <AuthField label={t('用户名')} value={username} onChange={setUsername} autoComplete='username' placeholder={t('3–20 个字符')} required />
        {needsEmail ? (
          <>
            <AuthField label={t('邮箱')} type='email' value={email} onChange={setEmail} autoComplete='email' placeholder='name@example.com' required />
            <div className='flex items-end gap-2'>
              <div className='flex-1'>
                <AuthField label={t('邮箱验证码')} value={code} onChange={setCode} autoComplete='one-time-code' required />
              </div>
              <button
                type='button'
                onClick={sendCode}
                className='border-or-line hover:bg-or-fill h-10 shrink-0 rounded-[6px] border px-3 text-[14px]'
              >
                {t('发送验证码')}
              </button>
            </div>
          </>
        ) : null}
        <AuthField label={t('密码')} type='password' value={password} onChange={setPassword} autoComplete='new-password' placeholder={t('至少 8 位')} required />
        <AuthField label={t('确认密码')} type='password' value={confirm} onChange={setConfirm} autoComplete='new-password' required />
        {notice ? <p className='text-or-primary text-[13px]'>{notice}</p> : null}
        {error ? <p role='alert' className='text-or-red text-[13px]'>{error}</p> : null}
        <AuthSubmit busy={busy}>{t('创建账号')}</AuthSubmit>
      </form>
    </AuthCard>
  )
}
