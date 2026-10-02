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
import { Link, useSearchParams } from 'react-router'

import { AuthCard } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { CopyField, copyText } from '@/pages/account/account-ui'

import { confirmReset } from './auth-api'
import { AUTH_LINK, AuthMessage, PrimaryButton } from './auth-parts'

const BUTTON_LINK =
  'bg-or-primary text-or-bg flex h-10 w-full items-center justify-center rounded-[6px] text-[14px] font-medium transition-opacity hover:opacity-90'

/**
 * Landing page of the reset email (/user/reset?email=…&token=…): confirming
 * the link makes the server set a new random password, shown here once.
 */
export function ResetPasswordPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const email = params.get('email')?.trim() ?? ''
  const token = params.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!email || !token) {
    return (
      <AuthCard title={t('重置密码')}>
        <div className='flex flex-col gap-4'>
          <AuthMessage tone='error'>{t('重置链接无效，请重新找回密码。')}</AuthMessage>
          <Link to='/forgot-password' className={BUTTON_LINK}>
            {t('重新找回密码')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  if (password) {
    return (
      <AuthCard title={t('重置密码')} subtitle={t('密码已重置，请用新密码登录，并尽快在账户安全中修改。')}>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <span className='text-or-fg text-[14px]'>{t('新密码')}</span>
            <CopyField value={password} />
            {copied ? <span className='text-or-dim text-[12px]'>{t('已自动复制到剪贴板')}</span> : null}
          </div>
          <Link to='/sign-in' className={BUTTON_LINK}>
            {t('返回登录')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  async function onConfirm() {
    setError('')
    setBusy(true)
    try {
      const fresh = await confirmReset(email, token)
      setCopied(await copyText(fresh))
      setPassword(fresh)
    } catch (err) {
      setError(errorMessage(err, t('重置失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title={t('重置密码')}
      subtitle={t('确认后会为你生成一个新密码。')}
      footer={
        <Link to='/sign-in' className={AUTH_LINK}>
          {t('返回登录')}
        </Link>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1.5'>
          <span className='text-or-muted text-[13px]'>{t('账户邮箱')}</span>
          <span className='text-or-fg text-[14px] break-all'>{email}</span>
        </div>
        {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
        <PrimaryButton type='button' busy={busy} onClick={onConfirm}>
          {t('确认重置')}
        </PrimaryButton>
      </div>
    </AuthCard>
  )
}
