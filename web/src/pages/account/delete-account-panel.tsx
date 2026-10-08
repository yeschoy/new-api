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
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button, Field, Modal, Notice, Panel, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { logout } from '@/lib/services'
import { ROLE_ROOT } from '@/pages/console/console-nav'

import { deleteAccount, type AccountUser } from './account-api'
import { SettingRow } from './account-ui'

/** Deleting one's own account (DELETE /api/user/self); the super administrator cannot. */
export function DeleteAccountPanel(props: { user: AccountUser | null }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!props.user || props.user.role >= ROLE_ROOT) return null
  return (
    <Panel title={t('删除账户')}>
      <SettingRow title={t('永久删除账户')} description={t('账户及其数据将被删除，且无法恢复。')}>
        <Button variant='danger' onClick={() => setOpen(true)}>
          {t('删除账户')}
        </Button>
      </SettingRow>
      {open ? <DeleteAccountModal username={props.user.username} onClose={() => setOpen(false)} /> : null}
    </Panel>
  )
}

function DeleteAccountModal(props: { username: string; onClose: () => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (typed !== props.username) return
    setError('')
    setBusy(true)
    try {
      await deleteAccount()
      toast.success(t('账户已删除'))
      await logout().catch(() => undefined)
      queryClient.removeQueries({ queryKey: ['console'] })
      navigate('/sign-in', { replace: true })
    } catch (err) {
      setError(errorMessage(err, t('删除失败')))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('删除账户')} onClose={props.onClose}>
      <form onSubmit={onSubmit} className='flex flex-col gap-4'>
        <Notice tone='error'>{t('此操作无法撤销。')}</Notice>
        <Field label={t('输入用户名 {username} 以确认', { username: props.username })} htmlFor={inputId}>
          <TextInput id={inputId} value={typed} onChange={setTyped} placeholder={props.username} autoFocus />
        </Field>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button type='submit' variant='danger' busy={busy} disabled={typed !== props.username}>
            {t('删除账户')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
