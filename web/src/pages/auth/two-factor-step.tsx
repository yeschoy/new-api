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

import { AuthCard, AuthField } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { loginTwoFactor } from '@/lib/services'

import { AuthMessage, PrimaryButton } from './auth-parts'

/** Second sign-in step: the authenticator code, or one of the backup codes, with the password step's flow token. */
export function TwoFactorStep(props: { flowToken: string; onBack: () => void; onSignedIn: () => void }) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await loginTwoFactor(code.trim(), props.flowToken)
      if (result.kind === 'signed-in') props.onSignedIn()
      else if (result.kind === 'error') setError(result.message)
    } catch (err) {
      setError(errorMessage(err, t('登录失败')))
    } finally {
      setBusy(false)
    }
  }

  function switchKind() {
    setBackup(!backup)
    setCode('')
    setError('')
  }

  return (
    <AuthCard title={t('两步验证')} subtitle={backup ? t('请输入一个未使用过的备用码') : t('请输入验证器 App 中的 6 位验证码')}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <AuthField
          key={backup ? 'backup' : 'totp'}
          label={backup ? t('备用码') : t('验证码')}
          value={code}
          onChange={setCode}
          autoComplete='one-time-code'
          placeholder={backup ? 'XXXX-XXXX' : '000000'}
          required
        />
        {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
        <PrimaryButton busy={busy}>{t('验证')}</PrimaryButton>
        <div className='text-or-muted flex items-center justify-center gap-2 text-[13px]'>
          <button type='button' onClick={switchKind} className='hover:text-or-fg'>
            {backup ? t('改用验证器验证码') : t('改用备用码')}
          </button>
          <span aria-hidden='true'>·</span>
          <button type='button' onClick={props.onBack} className='hover:text-or-fg'>
            {t('返回登录')}
          </button>
        </div>
      </form>
    </AuthCard>
  )
}
