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

import { Button, Modal, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { KeyEditor } from '@/pages/keys/key-editor'
import { keyToForm, newKeyForm, type KeyForm } from '@/pages/keys/key-form'
import { useKeyDialogData, useToAmount } from '@/pages/keys/use-key-dialog-data'

/**
 * Create a key (afterwards it is shown once), or edit one. Editing waits for
 * the key and the account's groups so the form starts from what is stored;
 * after that, refetches never reset what is being typed.
 */
export function KeyDialog(props: { keyId?: number; onClose: () => void }) {
  const { t } = useI18n()
  const data = useKeyDialogData(props.keyId)
  const toAmount = useToAmount()
  const editing = props.keyId !== undefined
  const [initial, setInitial] = useState<KeyForm | null>(() => (editing ? null : { ...newKeyForm(false), crossGroupRetry: true }))

  const detail = data.detail.data
  const loaded = detail && !data.detail.isFetching && !data.groups.isPending && !data.auto.isPending
  if (!initial && loaded) {
    const available = data.groups.data?.map((group) => group.name).filter((name) => name !== 'auto')
    setInitial(keyToForm(detail, { available, max: data.auto.data?.max ?? 5, toAmount }))
  }

  if (initial) return <KeyEditor initial={initial} keyId={props.keyId} data={data} onClose={props.onClose} />

  return (
    <Modal title={t('编辑密钥')} onClose={props.onClose} footer={<Button onClick={props.onClose}>{t('关闭')}</Button>}>
      {data.detail.isError ? (
        <Notice tone='error'>{errorMessage(data.detail.error, t('密钥加载失败'))}</Notice>
      ) : (
        <p className='text-or-muted text-[14px]'>{t('加载中…')}</p>
      )}
    </Modal>
  )
}
