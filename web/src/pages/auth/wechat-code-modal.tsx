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

import { Button, Field, Modal, Notice, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

/**
 * WeChat sign-in and binding: the visitor follows the official account, which
 * replies with a code typed in here.
 */
export function WeChatCodeModal(props: {
  title: string
  qrcode: string
  submitLabel: string
  onSubmit: (code: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const codeId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = code.trim()
    if (!value) return
    setError('')
    setBusy(true)
    try {
      await props.onSubmit(value)
    } catch (err) {
      setError(errorMessage(err, t('操作失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <p className='text-or-muted text-[14px]'>{t('扫码关注公众号，回复“验证码”获取验证码。')}</p>
        {props.qrcode ? (
          <img src={props.qrcode} alt={t('微信公众号二维码')} className='border-or-line mx-auto size-44 rounded-[8px] border object-contain' />
        ) : (
          <Notice tone='info'>{t('管理员尚未上传公众号二维码。')}</Notice>
        )}
        <Field label={t('验证码')} htmlFor={codeId}>
          <TextInput id={codeId} value={code} onChange={setCode} autoFocus />
        </Field>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='primary' busy={busy} disabled={!code.trim()}>
            {props.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
