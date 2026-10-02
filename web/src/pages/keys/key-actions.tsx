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

import { Button, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { KEY_STATUS_DISABLED, KEY_STATUS_ENABLED, setKeyStatus, unwrap } from '@/lib/console-api'
import { deleteKey } from '@/lib/services'

import type { KeyDetail } from './keys-api'

/** Enable / disable and delete (asked inline first) for one key. */
export function KeyActions(props: { apiKey: KeyDetail }) {
  const { t } = useI18n()
  const key = props.apiKey
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['console'] })
  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteKey(key.id), t('删除失败')),
    onSuccess: () => {
      toast.success(t('密钥已删除'))
      return refresh()
    },
    onError: (err) => setError(errorMessage(err, t('删除失败'))),
  })
  const enabled = key.status === KEY_STATUS_ENABLED
  const toggle = useMutation({
    mutationFn: () => setKeyStatus(key.id, enabled ? KEY_STATUS_DISABLED : KEY_STATUS_ENABLED),
    onSuccess: () => {
      toast.success(enabled ? t('密钥已禁用') : t('密钥已启用'))
      return refresh()
    },
    onError: (err) => setError(errorMessage(err, t('操作失败'))),
  })

  return (
    <div className='flex flex-col items-end'>
      <div className='flex flex-wrap items-center justify-end gap-1'>
        {confirming ? (
          <>
            <span className='text-or-muted mr-1 text-[13px] whitespace-nowrap'>{t('确认删除？')}</span>
            <Button size='sm' variant='danger' busy={remove.isPending} onClick={() => remove.mutate()}>
              {t('删除')}
            </Button>
            <Button size='sm' variant='ghost' onClick={() => setConfirming(false)}>
              {t('取消')}
            </Button>
          </>
        ) : (
          <>
            <Button size='sm' variant='ghost' busy={toggle.isPending} onClick={() => toggle.mutate()}>
              {enabled ? t('禁用') : t('启用')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              className='hover:text-or-red'
              onClick={() => {
                setError(null)
                setConfirming(true)
              }}
            >
              {t('删除')}
            </Button>
          </>
        )}
      </div>
      {error ? <div className='text-or-red mt-1 max-w-[240px] text-right text-[12px]'>{error}</div> : null}
    </div>
  )
}
