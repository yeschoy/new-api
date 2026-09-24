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
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { useStatus } from '@/lib/queries'
import { login, loginTwoFactor } from '@/lib/services'
import { useSiteSkin } from '@/site/site-skin'

/** Only same-site paths are accepted as post-login destinations. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/settings/keys'
  return value
}

export function SignInPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { skin } = useSiteSkin()
  const { data: status } = useStatus()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'password' | 'two-factor'>('password')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const redirect = safeRedirect(params.get('redirect'))

  if (auth.status === 'authenticated') return <Navigate to={redirect} replace />

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result =
        step === 'password'
          ? await login({ username, password, encrypt: Boolean(status?.password_login_encryption_enabled) })
          : await loginTwoFactor(code)
      if (result.kind === 'signed-in') navigate(redirect, { replace: true })
      else if (result.kind === 'two-factor') setStep('two-factor')
      else setError(result.message)
    } catch (err) {
      setError(errorMessage(err, '登录失败'))
    } finally {
      setBusy(false)
    }
  }

  const router = skin === 'router'
  const linkClass = router ? 'text-or-fg font-medium hover:underline' : 'text-hub-link hover:underline'
  const canRegister = status?.register_enabled !== false && status?.password_register_enabled !== false

  return (
    <AuthCard
      title={step === 'password' ? '登录' : '两步验证'}
      subtitle={step === 'two-factor' ? '请输入验证器 App 中的 6 位验证码' : undefined}
      footer={
        canRegister ? (
          <>
            还没有账号？{' '}
            <Link to={`/sign-up?redirect=${encodeURIComponent(redirect)}`} className={linkClass}>注册</Link>
          </>
        ) : null
      }
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        {step === 'password' ? (
          <>
            <AuthField label='用户名或邮箱' value={username} onChange={setUsername} autoComplete='username' placeholder='请输入用户名或邮箱' required />
            <AuthField label='密码' type='password' value={password} onChange={setPassword} autoComplete='current-password' placeholder='请输入密码' required />
          </>
        ) : (
          <AuthField label='验证码' value={code} onChange={setCode} autoComplete='one-time-code' placeholder='000000' required />
        )}
        {error ? <p role='alert' className='text-[13px] text-[#ff4d4f]'>{error}</p> : null}
        <AuthSubmit busy={busy}>{step === 'password' ? '继续' : '验证'}</AuthSubmit>
        {status?.turnstile_check ? (
          <p className={router ? 'text-or-dim text-center text-[12px]' : 'text-center text-[12px] text-[#888]'}>
            本站开启了人机验证，如登录失败请联系管理员。
          </p>
        ) : null}
      </form>
    </AuthCard>
  )
}
