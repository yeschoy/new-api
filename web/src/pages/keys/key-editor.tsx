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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button, Modal, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useStatus } from '@/lib/queries'
import { useMoney } from '@/pages/console/console-hooks'

import { KeyCreated, type CreateResult } from './key-created'
import { batchNames, formToPayload, resolveGroup, validateKeyForm, type KeyForm } from './key-form'
import { KeyFormBody } from './key-form-body'
import { addKey, revealOne, updateKey, type KeyPayload } from './keys-api'
import type { KeyDialogData } from './use-key-dialog-data'

/** Creates `count` keys one by one, stopping at the first refusal; the first refusal throws. */
async function createKeys(payload: KeyPayload, count: number, fallback: string): Promise<CreateResult> {
  const made: number[] = []
  let failure: string | null = null
  for (const name of batchNames(payload.name, count)) {
    try {
      const key = await addKey({ ...payload, name })
      made.push(key?.id ?? 0)
    } catch (err) {
      if (!made.length) throw err
      failure = errorMessage(err, fallback)
      break
    }
  }
  let fullKey = ''
  if (count === 1 && made[0]) {
    // The key exists either way; without its full value the list's "show" still works.
    fullKey = await revealOne(made[0]).catch(() => '')
  }
  return { count: made.length, fullKey, failure }
}

/**
 * The create / edit form for a key. A new key's group follows the site
 * default (auto when the site uses it) until one is picked.
 */
export function KeyEditor(props: { initial: KeyForm; keyId?: number; data: KeyDialogData; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const { data: status } = useStatus()
  const queryClient = useQueryClient()
  const editing = props.keyId !== undefined
  const [form, setForm] = useState(props.initial)
  const [groupChosen, setGroupChosen] = useState(editing)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateResult | null>(null)

  const names = (props.data.groups.data ?? []).map((group) => group.name)
  const autoDefault = status?.default_use_auto_group === true && (names.length === 0 || names.includes('auto'))
  const siteDefault = autoDefault ? 'auto' : ''
  const group = resolveGroup(groupChosen ? form.group : siteDefault, names)
  const current: KeyForm = { ...form, group }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['console'] })

  const create = useMutation({
    mutationFn: (input: { payload: KeyPayload; count: number }) => createKeys(input.payload, input.count, t('创建失败')),
    onSuccess: (created) => {
      setResult(created)
      return refresh()
    },
    onError: (err) => setError(errorMessage(err, t('创建失败'))),
  })
  const save = useMutation({
    mutationFn: (payload: KeyPayload) => updateKey(props.keyId ?? 0, payload),
    onSuccess: () => {
      toast.success(t('密钥已更新'))
      props.onClose()
      return refresh()
    },
    onError: (err) => setError(errorMessage(err, t('保存失败'))),
  })

  function change(patch: Partial<KeyForm>) {
    setForm((value) => ({ ...value, ...patch }))
  }

  function submit() {
    setError(null)
    const problem = validateKeyForm(current, { creating: !editing, maxAutoGroups: props.data.auto.data?.max ?? 5, toQuota: money.toQuota })
    if (problem) {
      setError(t(problem.text, problem.vars))
      return
    }
    const payload = formToPayload(current, money.toQuota)
    if (editing) save.mutate(payload)
    else create.mutate({ payload, count: Number(current.count) })
  }

  if (result) {
    return (
      <Modal title={t('密钥已创建')} onClose={props.onClose} footer={<Button variant='primary' onClick={props.onClose}>{t('完成')}</Button>}>
        <KeyCreated result={result} />
      </Modal>
    )
  }

  return (
    <Modal
      title={editing ? t('编辑密钥') : t('创建 API 密钥')}
      size='lg'
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button variant='primary' busy={create.isPending || save.isPending} onClick={submit}>
            {editing ? t('保存') : t('创建')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLInputElement
          if (event.key === 'Enter' && target.tagName === 'INPUT' && target.type === 'text' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      >
        <KeyFormBody
          form={current}
          editing={editing}
          data={props.data}
          error={error}
          onChange={change}
          onGroup={(value) => {
            change({ group: value })
            setGroupChosen(true)
          }}
        />
      </form>
    </Modal>
  )
}
