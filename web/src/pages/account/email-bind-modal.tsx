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
import { useId, useState } from 'react'

import { Button, Field, Modal, Notice, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { sendVerificationEmail } from '@/pages/auth/auth-api'
import { useTurnstile } from '@/pages/auth/turnstile'

import { useCountdown } from './account-ui'
import { bindEmail } from './profile-api'

/** Seconds before another code may be sent, as on the old site. */
const RESEND_SECONDS = 60

/** Binds or changes the account email with a code mailed to the new address. */
export function EmailBindModal(props: { current: string; onBound: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const emailId = useId()
  const codeId = useId()
  const turnstile = useTurnstile()
  const countdown = useCountdown()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const title = props.current ? t('更换邮箱') : t('绑定邮箱')

  async function sendCode() {
    setError('')
    setNotice('')
    if (!email.includes('@')) return setError(t('请输入有效的邮箱地址'))
    if (!turnstile.ready) return setError(t('请先完成人机验证'))
    setSending(true)
    try {
      await sendVerificationEmail(email.trim(), turnstile.token)
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
    setBusy(true)
    try {
      await bindEmail(email.trim(), code.trim())
      toast.success(t('邮箱已绑定'))
      props.onBound()
      props.onClose()
    } catch (err) {
      setError(errorMessage(err, t('绑定失败')))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        {props.current ? <p className='text-or-muted text-[14px]'>{t('当前邮箱：{email}', { email: props.current })}</p> : null}
        <Field label={t('邮箱')} htmlFor={emailId}>
          <TextInput id={emailId} type='email' value={email} onChange={setEmail} placeholder='name@example.com' autoFocus />
        </Field>
        <Field label={t('验证码')} htmlFor={codeId}>
          <div className='flex gap-2'>
            <TextInput id={codeId} value={code} onChange={setCode} maxLength={6} />
            <Button busy={sending} disabled={countdown.left > 0 || !email} onClick={sendCode}>
              {countdown.left > 0 ? t('{seconds} 秒后可重新发送', { seconds: countdown.left }) : t('发送验证码')}
            </Button>
          </div>
        </Field>
        {turnstile.widget}
        {notice ? <Notice tone='success'>{notice}</Notice> : null}
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='primary' busy={busy} disabled={!email.trim() || !code.trim()}>
            {t('绑定')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
