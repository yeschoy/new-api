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
import { Copy, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button, ConfirmButton, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { deleteAllKeys, deleteKeys, revealKeys, type KeyDetail } from './keys-api'

export const CHECKBOX = 'accent-or-primary size-4 shrink-0 cursor-pointer'

/** Ticks every key shown on this page, or clears them when all are ticked. */
export function SelectAll(props: { shown: number; selected: number; onChange: (all: boolean) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  const all = props.shown > 0 && props.selected === props.shown
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.selected > 0 && !all
  }, [props.selected, all])
  return (
    <label className='text-or-muted flex h-9 cursor-pointer items-center gap-2 px-1 text-[14px] whitespace-nowrap'>
      <input ref={ref} type='checkbox' className={CHECKBOX} checked={all} disabled={props.shown === 0} onChange={() => props.onChange(!all)} />
      {t('全选本页')}
    </label>
  )
}

/** Copy (name and key per line) or delete the ticked keys. */
export function BulkBar(props: { selected: KeyDetail[]; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const ids = props.selected.map((key) => key.id)

  const copy = useMutation({
    mutationFn: async () => {
      const full = await revealKeys(ids)
      const lines = props.selected.filter((key) => full[key.id]).map((key) => `${key.name}\t${full[key.id]}`)
      if (!lines.length) throw new Error(t('获取密钥失败'))
      await navigator.clipboard.writeText(lines.join('\n'))
      return lines.length
    },
    onSuccess: (count) => toast.success(t('已复制 {count} 个密钥', { count })),
    onError: (err) => toast.error(errorMessage(err, t('复制失败'))),
  })
  const remove = useMutation({
    mutationFn: () => deleteKeys(ids),
    onSuccess: (count) => {
      toast.success(t('已删除 {count} 个密钥', { count }))
      props.onDone()
      return queryClient.invalidateQueries({ queryKey: ['console'] })
    },
    onError: (err) => toast.error(errorMessage(err, t('删除失败'))),
  })

  return (
    <div className='border-or-line bg-or-fill mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border px-3 py-2'>
      <span className='text-[14px] font-medium'>{t('已选 {count} 个', { count: ids.length })}</span>
      <div className='ml-auto flex flex-wrap items-center justify-end gap-1'>
        <Button size='sm' busy={copy.isPending} onClick={() => copy.mutate()}>
          <Copy className='size-3.5' aria-hidden='true' />
          {t('复制所选')}
        </Button>
        <ConfirmButton question={t('确认删除所选的 {count} 个密钥？', { count: ids.length })} busy={remove.isPending} onConfirm={() => remove.mutate()}>
          {t('删除所选')}
        </ConfirmButton>
        <Button size='sm' variant='ghost' onClick={props.onDone}>
          {t('取消选择')}
        </Button>
      </div>
    </div>
  )
}

/** Deletes every key of the account (all pages), after asking. */
export function DeleteAllKeys(props: { total: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: deleteAllKeys,
    onSuccess: () => toast.success(t('已删除全部密钥')),
    onError: (err) => toast.error(errorMessage(err, t('删除失败'))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['console'] }),
  })
  if (props.total <= 0) return null
  return (
    <ConfirmButton question={t('确认删除全部 {count} 个密钥？', { count: props.total })} busy={remove.isPending} onConfirm={() => remove.mutate()}>
      <Trash2 className='size-3.5' aria-hidden='true' />
      {t('删除全部密钥')}
    </ConfirmButton>
  )
}
