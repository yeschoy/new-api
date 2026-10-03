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
import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button, Field, Modal, Notice, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { enableTwoFactor, startTwoFactorSetup, type TwoFactorSetup } from './account-api'
import { CopyField } from './account-ui'
import { BackupCodeList } from './two-factor-codes'

/**
 * Turning two-step verification on: add the key to an authenticator, keep the
 * backup codes, then prove it works with a code. There is no QR library in
 * this frontend, so the key and the otpauth:// link are shown to copy.
 */
export function TwoFactorSetupModal(props: { onClose: () => void; onEnabled: () => void }) {
  const { t } = useI18n()
  const codeId = useId()
  const started = useRef(false)
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [step, setStep] = useState(0)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Every setup call replaces the pending secret, so StrictMode must not make a second one.
    if (started.current) return
    started.current = true
    startTwoFactorSetup().then(setSetup, (err) => setError(errorMessage(err, t('无法开始设置两步验证'))))
  }, [t])

  async function onEnable(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await enableTwoFactor(code.trim())
      toast.success(t('两步验证已启用'))
      props.onEnabled()
      props.onClose()
    } catch (err) {
      setError(errorMessage(err, t('启用失败')))
    } finally {
      setBusy(false)
    }
  }

  const titles = [t('添加到验证器'), t('保存备用码'), t('输入验证码')]

  return (
    <Modal title={t('启用两步验证')} onClose={props.onClose}>
      {setup ? (
        <form onSubmit={onEnable} className='flex flex-col gap-4'>
          <div className='text-or-muted text-[13px]'>
            {t('第 {step} / 3 步', { step: step + 1 })} · <span className='text-or-fg font-medium'>{titles[step]}</span>
          </div>
          {step === 0 ? (
            <>
              <p className='text-or-muted text-[14px]'>{t('在验证器 App（如 Google Authenticator、Microsoft Authenticator）中添加账户，手动输入下面的密钥：')}</p>
              <CopyField value={setup.secret} />
              <p className='text-or-muted text-[14px]'>{t('也可以复制完整的配置链接，在支持的 App 中打开：')}</p>
              <CopyField value={setup.qr_code_data} />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Notice tone='info'>{t('每个备用码只能使用一次。请把它们保存在安全的地方，手机不在身边时可以用来登录。')}</Notice>
              <BackupCodeList codes={setup.backup_codes} />
            </>
          ) : null}
          {step === 2 ? (
            <Field label={t('验证码')} htmlFor={codeId} hint={t('输入验证器 App 显示的 6 位数字。')}>
              <TextInput id={codeId} value={code} onChange={setCode} maxLength={6} placeholder='000000' autoFocus />
            </Field>
          ) : null}
          {error ? <Notice tone='error'>{error}</Notice> : null}
          <div className='flex justify-end gap-2'>
            {step > 0 ? <Button onClick={() => setStep(step - 1)}>{t('上一步')}</Button> : null}
            {step < 2 ? (
              <Button variant='primary' onClick={() => setStep(step + 1)}>
                {t('下一步')}
              </Button>
            ) : (
              <Button type='submit' variant='primary' busy={busy} disabled={!code.trim()}>
                {t('启用')}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <SetupLoading error={error} />
      )}
    </Modal>
  )
}

function SetupLoading(props: { error: string }) {
  const { t } = useI18n()
  if (props.error) return <Notice tone='error'>{props.error}</Notice>
  return (
    <div className='text-or-muted flex items-center justify-center gap-2 py-8 text-[14px]' role='status'>
      <Loader2 className='size-4 animate-spin' aria-hidden='true' />
      {t('正在生成密钥…')}
    </div>
  )
}
