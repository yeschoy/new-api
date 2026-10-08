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
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { Button, Notice, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { updateDisplayName } from '@/lib/console-api'

/** Inline editor; PUT /api/user/self only applies a non-empty display_name (max 20). */
export function DisplayNameEditor(props: { value: string }) {
  const { t } = useI18n()
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
    onError: (err) => setError(errorMessage(err, t('保存失败'))),
  })

  if (!editing) {
    return (
      <div className='flex items-center gap-2'>
        <span>{props.value || t('未设置')}</span>
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
          {t('编辑')}
        </Button>
      </div>
    )
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) {
      setError(t('显示名称不能为空'))
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
        <TextInput value={draft} onChange={setDraft} maxLength={20} autoFocus ariaLabel={t('显示名称')} />
        <Button type='submit' variant='primary' busy={save.isPending}>
          {t('保存')}
        </Button>
        <Button variant='ghost' onClick={() => setEditing(false)}>
          {t('取消')}
        </Button>
      </div>
      {error ? <Notice tone='error'>{error}</Notice> : null}
    </form>
  )
}
