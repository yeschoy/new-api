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

import { Button, Field, Modal, Notice, Panel, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { changePassword } from './account-api'
import { SettingRow } from './account-ui'

export function PasswordPanel() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <Panel title={t('登录密码')}>
      <SettingRow title={t('修改登录密码')} description={t('修改后，其他设备上的登录会全部退出。')}>
        <Button onClick={() => setOpen(true)}>{t('修改密码')}</Button>
      </SettingRow>
      {open ? <PasswordModal onClose={() => setOpen(false)} /> : null}
    </Panel>
  )
}

/** The backend allows 8 to 20 characters (model/user.go). */
function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'current'
  if (next.length < 8) return 'short'
  if (next.length > 20) return 'long'
  if (next === current) return 'same'
  if (next !== confirm) return 'mismatch'
  return null
}

function PasswordModal(props: { onClose: () => void }) {
  const { t } = useI18n()
  const ids = { current: useId(), next: useId(), confirm: useId() }
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const messages: Record<string, string> = {
    current: t('请输入当前密码'),
    short: t('密码至少 8 位'),
    long: t('密码最多 20 位'),
    same: t('新密码不能与当前密码相同'),
    mismatch: t('两次输入的密码不一致'),
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const problem = passwordProblem(current, next, confirm)
    if (problem) return setError(messages[problem])
    setError('')
    setBusy(true)
    try {
      await changePassword(current, next)
      toast.success(t('密码已修改'))
      props.onClose()
    } catch (err) {
      setError(errorMessage(err, t('修改失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('修改密码')} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <Field label={t('当前密码')} htmlFor={ids.current}>
          <TextInput id={ids.current} type='password' value={current} onChange={setCurrent} autoFocus />
        </Field>
        <Field label={t('新密码')} htmlFor={ids.next} hint={t('8–20 个字符')}>
          <TextInput id={ids.next} type='password' value={next} onChange={setNext} />
        </Field>
        <Field label={t('确认新密码')} htmlFor={ids.confirm}>
          <TextInput id={ids.confirm} type='password' value={confirm} onChange={setConfirm} />
        </Field>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='primary' busy={busy}>
            {t('保存')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
