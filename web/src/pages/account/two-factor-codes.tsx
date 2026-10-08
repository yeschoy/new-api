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
import { Copy } from 'lucide-react'
import { useId, useState } from 'react'

import { Button, Field, Modal, Notice, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { disableTwoFactor, regenerateBackupCodes } from './account-api'
import { copyText } from './account-ui'

/** Backup codes in a two-column grid, with one button to copy them all. */
export function BackupCodeList(props: { codes: string[] }) {
  const { t } = useI18n()
  async function copyAll() {
    if (await copyText(props.codes.join('\n'))) toast.success(t('已复制'))
    else toast.error(t('复制失败'))
  }
  return (
    <div className='flex flex-col gap-3'>
      <ul className='border-or-line bg-or-bg grid grid-cols-2 gap-2 rounded-[6px] border p-3'>
        {props.codes.map((code) => (
          <li key={code} className='font-geist text-center text-[13px] tracking-wide'>
            {code}
          </li>
        ))}
      </ul>
      <Button onClick={copyAll}>
        <Copy className='size-3.5' aria-hidden='true' />
        {t('复制全部备用码')}
      </Button>
    </div>
  )
}

/** A fresh set of backup codes after an authenticator code; the old ones stop working. */
export function BackupCodesModal(props: { onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n()
  const codeId = useId()
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      setCodes(await regenerateBackupCodes(code.trim()))
      props.onChanged()
    } catch (err) {
      setError(errorMessage(err, t('生成失败')))
    } finally {
      setBusy(false)
    }
  }

  if (codes) {
    return (
      <Modal title={t('重新生成备用码')} onClose={props.onClose}>
        <div className='flex flex-col gap-4'>
          <Notice tone='success'>{t('新的备用码已生成，请立即保存。')}</Notice>
          <BackupCodeList codes={codes} />
          <div className='flex justify-end'>
            <Button variant='primary' onClick={props.onClose}>
              {t('完成')}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t('重新生成备用码')} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <Notice tone='info'>{t('重新生成后，原有的备用码将全部失效。')}</Notice>
        <Field label={t('验证码')} htmlFor={codeId} hint={t('输入验证器 App 中的验证码。')}>
          <TextInput id={codeId} value={code} onChange={setCode} maxLength={6} placeholder='000000' autoFocus />
        </Field>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='primary' busy={busy} disabled={!code.trim()}>
            {t('生成新备用码')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Turning two-step verification off: a code or backup code, and an acknowledged risk. */
export function DisableTwoFactorModal(props: { onClose: () => void; onDisabled: () => void }) {
  const { t } = useI18n()
  const codeId = useId()
  const confirmId = useId()
  const [code, setCode] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await disableTwoFactor(code.trim())
      toast.success(t('两步验证已关闭'))
      props.onDisabled()
      props.onClose()
    } catch (err) {
      setError(errorMessage(err, t('关闭失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('关闭两步验证')} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <Notice tone='error'>{t('关闭后，登录将不再需要验证码，账户安全性会降低。')}</Notice>
        <Field label={t('验证码或备用码')} htmlFor={codeId}>
          <TextInput id={codeId} value={code} onChange={setCode} autoFocus />
        </Field>
        <label htmlFor={confirmId} className='text-or-muted flex items-start gap-2 text-[13px]'>
          <input
            id={confirmId}
            type='checkbox'
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            className='accent-or-primary mt-0.5 size-4 shrink-0'
          />
          {t('我了解关闭后所有备用码也会失效')}
        </label>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='danger' busy={busy} disabled={!code.trim() || !understood}>
            {t('关闭两步验证')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
