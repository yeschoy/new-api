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

import { proofByCode, type ProofScope } from './passkey-api'

/** Asks for an authenticator (or backup) code and turns it into a security proof for `scope`. */
export function ProofModal(props: { scope: ProofScope; onProof: (proof: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const codeId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const proof = await proofByCode(props.scope, code.trim())
      props.onClose()
      props.onProof(proof)
    } catch (err) {
      setError(errorMessage(err, t('验证失败')))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('安全验证')} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <p className='text-or-muted text-[14px]'>{t('这项操作需要先验证身份，请输入验证器 App 中的验证码或一个备用码。')}</p>
        <Field label={t('验证码')} htmlFor={codeId}>
          <TextInput id={codeId} value={code} onChange={setCode} autoFocus />
        </Field>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='primary' busy={busy} disabled={!code.trim()}>
            {t('验证')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
