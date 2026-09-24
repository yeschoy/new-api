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
import { LogOut, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { RequireAuth } from '@/components/require-auth'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { updateDisplayName } from '@/lib/console-api'
import { cn } from '@/lib/format'
import { logout } from '@/lib/services'

import { roleLabel } from './console-helpers'
import { useSelf } from './console-hooks'
import { ConsoleLayout } from './console-layout'
import { Button, Notice, Panel, TextInput, useIsRouter, useMutedText } from './console-ui'

/** Account details, display-name editing and sign-out. */
export function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  )
}

function ProfileContent() {
  const router = useIsRouter()
  const muted = useMutedText()
  const auth = useAuth()
  const self = useSelf()
  const user = self.data ?? auth.user
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await logout().catch(() => undefined)
    queryClient.removeQueries({ queryKey: ['console'] })
    navigate('/')
  }

  const rows: Array<[string, React.ReactNode]> = [
    ['用户 ID', user ? String(user.id) : '—'],
    ['用户名', user?.username || '—'],
    ['显示名称', <DisplayNameEditor value={user?.display_name ?? ''} />],
    ['邮箱', user?.email || <span className={muted}>未绑定</span>],
    ['分组', user?.group || 'default'],
    ['角色', roleLabel(user?.role)],
  ]

  return (
    <ConsoleLayout active='profile' title='账户设置' description='管理账户资料与登录状态。'>
      <div className='flex flex-col gap-4'>
        <Panel title='基本信息' flush>
          <dl>
            {rows.map(([label, value]) => (
              <div
                key={label}
                className={cn(
                  'flex flex-col gap-1 border-t px-5 py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:gap-6',
                  router ? 'border-or-line' : 'border-[#f0f0f0]'
                )}
              >
                <dt className={cn('w-[120px] shrink-0 text-[14px]', muted)}>{label}</dt>
                <dd className='min-w-0 flex-1 text-[14px] break-all'>{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title='退出登录'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <p className={cn('text-[14px]', muted)}>退出当前浏览器中的登录状态，API 密钥不受影响。</p>
            <Button busy={signingOut} onClick={signOut}>
              <LogOut className='size-4' aria-hidden='true' />
              退出登录
            </Button>
          </div>
        </Panel>
      </div>
    </ConsoleLayout>
  )
}

/** Inline editor; PUT /api/user/self only applies a non-empty display_name (max 20). */
function DisplayNameEditor(props: { value: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (name: string) => updateDisplayName(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['console'] })
      setEditing(false)
    },
    onError: (err) => setError(errorMessage(err, '保存失败')),
  })

  if (!editing) {
    return (
      <div className='flex items-center gap-2'>
        <span>{props.value || '未设置'}</span>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => {
            setDraft(props.value)
            setError(null)
            setEditing(true)
          }}
        >
          <Pencil className='size-3.5' aria-hidden='true' />
          编辑
        </Button>
      </div>
    )
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) {
      setError('显示名称不能为空')
      return
    }
    if (name === props.value) {
      setEditing(false)
      return
    }
    setError(null)
    save.mutate(name)
  }

  return (
    <form onSubmit={onSubmit} className='flex max-w-[460px] flex-col gap-2'>
      <div className='flex gap-2'>
        <TextInput value={draft} onChange={setDraft} maxLength={20} autoFocus ariaLabel='显示名称' />
        <Button type='submit' variant='primary' busy={save.isPending}>
          保存
        </Button>
        <Button variant='ghost' onClick={() => setEditing(false)}>
          取消
        </Button>
      </div>
      {error ? <Notice tone='error'>{error}</Notice> : null}
    </form>
  )
}
