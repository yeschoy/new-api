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
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'

import { AuthCard, AuthField, AuthSubmit } from '@/components/auth-card'
import { api, errorMessage, type ApiEnvelope } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useStatus } from '@/lib/queries'
import { register } from '@/lib/services'
import { useSiteSkin } from '@/site/site-skin'

import { safeRedirect } from './sign-in-page'

export function SignUpPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { skin } = useSiteSkin()
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
  const router = skin === 'router'

  if (auth.status === 'authenticated') return <Navigate to={redirect} replace />

  const sendCode = async () => {
    setError('')
    setNotice('')
    if (!email) return setError('请先填写邮箱')
    try {
      const res = await api.get<ApiEnvelope<unknown>>('/api/verification', { params: { email } })
      if (res.data.success) setNotice('验证码已发送，请查收邮件')
      else setError(res.data.message || '发送失败')
    } catch (err) {
      setError(errorMessage(err, '发送失败'))
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('密码至少 8 位')
    if (password !== confirm) return setError('两次输入的密码不一致')
    setBusy(true)
    try {
      const result = await register({
        username,
        password,
        ...(needsEmail ? { email, verification_code: code } : {}),
      })
      if (result.kind === 'signed-in') navigate(redirect, { replace: true })
      else if (result.kind === 'registered') navigate(`/sign-in?redirect=${encodeURIComponent(redirect)}`, { replace: true })
      else if (result.kind === 'error') setError(result.message)
    } catch (err) {
      setError(errorMessage(err, '注册失败'))
    } finally {
      setBusy(false)
    }
  }

  if (status && (status.register_enabled === false || status.password_register_enabled === false)) {
    return (
      <AuthCard title='注册' subtitle='管理员已关闭新用户注册。'>
        <Link to='/sign-in' className={router ? 'text-or-fg block text-center underline' : 'text-hub-link block text-center'}>返回登录</Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title='注册'
      footer={
        <>
          已有账号？{' '}
          <Link to={`/sign-in?redirect=${encodeURIComponent(redirect)}`} className={router ? 'text-or-fg font-medium hover:underline' : 'text-hub-link hover:underline'}>
            登录
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <AuthField label='用户名' value={username} onChange={setUsername} autoComplete='username' placeholder='3–20 个字符' required />
        {needsEmail ? (
          <>
            <AuthField label='邮箱' type='email' value={email} onChange={setEmail} autoComplete='email' placeholder='name@example.com' required />
            <div className='flex items-end gap-2'>
              <div className='flex-1'>
                <AuthField label='邮箱验证码' value={code} onChange={setCode} autoComplete='one-time-code' required />
              </div>
              <button
                type='button'
                onClick={sendCode}
                className={cn(
                  'h-10 shrink-0 px-3 text-[14px]',
                  router ? 'border-or-line hover:bg-or-fill rounded-[6px] border' : 'rounded-[8px] border border-[#d9d9d9] bg-white hover:border-hub-link hover:text-hub-link'
                )}
              >
                发送验证码
              </button>
            </div>
          </>
        ) : null}
        <AuthField label='密码' type='password' value={password} onChange={setPassword} autoComplete='new-password' placeholder='至少 8 位' required />
        <AuthField label='确认密码' type='password' value={confirm} onChange={setConfirm} autoComplete='new-password' required />
        {notice ? <p className={router ? 'text-or-lime text-[13px]' : 'text-[13px] text-[#52c41a]'}>{notice}</p> : null}
        {error ? <p role='alert' className='text-[13px] text-[#ff4d4f]'>{error}</p> : null}
        <AuthSubmit busy={busy}>创建账号</AuthSubmit>
      </form>
    </AuthCard>
  )
}
