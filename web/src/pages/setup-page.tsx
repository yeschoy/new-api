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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { AuthCard, AuthField, AuthSubmit } from '@/components/auth-card'
import { errorMessage } from '@/lib/api'
import { getSetup, submitSetup } from '@/lib/services'
import { useSiteSkin } from '@/site/site-skin'

const MODES = [
  { id: 'external', label: '对外运营', hint: '面向其他用户提供服务' },
  { id: 'self', label: '自用', hint: '只给自己用，关闭计费限制' },
  { id: 'demo', label: '演示站', hint: '公开演示，限制敏感操作' },
] as const

/** First-run wizard: creates the root administrator. */
export function SetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { skin } = useSiteSkin()
  const setup = useQuery({ queryKey: ['setup'], queryFn: getSetup })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('external')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (setup.data?.status) return <Navigate to='/' replace />

  const needsAccount = !setup.data?.root_init

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (needsAccount) {
      if (password.length < 8) return setError('密码至少 8 位')
      if (password !== confirm) return setError('两次输入的密码不一致')
    }
    setBusy(true)
    try {
      const res = await submitSetup({
        username,
        password,
        confirmPassword: confirm,
        SelfUseModeEnabled: mode === 'self',
        DemoSiteEnabled: mode === 'demo',
      })
      if (!res.success) {
        setError(res.message || '初始化失败')
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['setup'] })
      navigate('/sign-in', { replace: true })
    } catch (err) {
      setError(errorMessage(err, '初始化失败'))
    } finally {
      setBusy(false)
    }
  }

  const router = skin === 'router'
  return (
    <AuthCard
      title='初始化系统'
      subtitle={`数据库：${setup.data?.database_type ?? '检测中…'}。创建管理员账号后即可登录。`}
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        {needsAccount ? (
          <>
            <AuthField label='管理员用户名' value={username} onChange={setUsername} autoComplete='username' required />
            <AuthField label='密码' type='password' value={password} onChange={setPassword} autoComplete='new-password' required />
            <AuthField label='确认密码' type='password' value={confirm} onChange={setConfirm} autoComplete='new-password' required />
          </>
        ) : null}
        <fieldset className='flex flex-col gap-2'>
          <legend className={router ? 'text-or-muted mb-2 text-[13px]' : 'mb-2 text-[13px] text-[#555]'}>使用模式</legend>
          {MODES.map((item) => (
            <label
              key={item.id}
              className={
                router
                  ? 'border-or-line flex cursor-pointer items-center gap-3 rounded-[6px] border px-3 py-2 text-[14px]'
                  : 'flex cursor-pointer items-center gap-3 rounded-[8px] border border-[#d9d9d9] px-3 py-2 text-[14px]'
              }
            >
              <input type='radio' name='mode' checked={mode === item.id} onChange={() => setMode(item.id)} />
              <span className='font-medium'>{item.label}</span>
              <span className={router ? 'text-or-muted text-[12px]' : 'text-[12px] text-[#888]'}>{item.hint}</span>
            </label>
          ))}
        </fieldset>
        {error ? <p className='text-[13px] text-[#ff4d4f]' role='alert'>{error}</p> : null}
        <AuthSubmit busy={busy}>完成初始化</AuthSubmit>
      </form>
    </AuthCard>
  )
}
