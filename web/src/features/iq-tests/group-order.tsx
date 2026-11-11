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
import { Reorder } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AutoGroupOrderItem } from '@/components/auto-group-order-item'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { getIQConfigs, saveIQGroupOrder } from './api'
import { iqKeys, isCurrentIQScope } from './queries'

export function IQGroupOrder(props: {
  scope: string
  groups: string[]
  canWrite: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [draft, setDraft] = useState<{
    groups: string[]
    previous: string[]
  } | null>(null)
  const [conflict, setConflict] = useState(false)
  const groups = draft?.groups ?? props.groups
  const changed = Boolean(
    draft &&
    draft.groups.some((group, index) => group !== draft.previous[index])
  )
  const save = useMutation({
    mutationFn: saveIQGroupOrder,
    retry: false,
    onSuccess: async () => {
      if (!isCurrentIQScope(props.scope)) return
      await Promise.all([
        client.invalidateQueries({ queryKey: iqKeys.configs(props.scope) }),
        client.invalidateQueries({ queryKey: iqKeys.results(props.scope) }),
      ])
      if (!isCurrentIQScope(props.scope)) return
      setDraft(null)
      setConflict(false)
      toast.success(t('Saved successfully'))
    },
    onError: (error) => {
      if (!isCurrentIQScope(props.scope)) return
      if (getServerErrorStatus(error) === 409) setConflict(true)
      else handleServerError(error)
    },
  })
  const disabled = !props.canWrite || save.isPending || conflict
  function reorder(next: string[]) {
    if (disabled) return
    setDraft((previous) => ({
      previous: previous?.previous ?? props.groups,
      groups: next,
    }))
  }
  function move(index: number, direction: 'up' | 'down') {
    const next = [...groups]
    const target = index + (direction === 'up' ? -1 : 1)
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder(next)
  }
  async function reload() {
    try {
      await client.cancelQueries({ queryKey: iqKeys.configs(props.scope) })
      const config = await getIQConfigs()
      if (!isCurrentIQScope(props.scope)) return
      client.setQueryData(iqKeys.configs(props.scope), config)
      setDraft(null)
      setConflict(false)
      save.reset()
    } catch (error) {
      if (isCurrentIQScope(props.scope)) handleServerError(error)
    }
  }
  return (
    <section
      className='min-w-0 space-y-3 rounded-lg border p-3'
      aria-labelledby='iq-group-order-title'
    >
      <h3 id='iq-group-order-title' className='text-sm font-medium'>
        {t('Group display order')}
      </h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.'
        )}
      </p>
      <Reorder.Group
        axis='y'
        values={groups}
        onReorder={reorder}
        className='space-y-2'
        aria-label={t('Group display order')}
        layoutScroll
      >
        {groups.map((group, index) => (
          <AutoGroupOrderItem
            key={group}
            group={group}
            index={index}
            count={groups.length}
            disabled={disabled}
            onMove={move}
          />
        ))}
      </Reorder.Group>
      {conflict && (
        <div role='alert' className='text-destructive space-y-2 text-sm'>
          <p>
            {t(
              'Configuration changed. Your edits are preserved; reload to reconcile before saving.'
            )}
          </p>
          <Button type='button' variant='outline' onClick={() => void reload()}>
            {t('Reload configuration (discard edits)')}
          </Button>
        </div>
      )}
      {props.canWrite && (
        <Button
          type='button'
          variant='outline'
          disabled={!changed || disabled}
          onClick={() => draft && save.mutate(draft)}
        >
          {save.isPending ? t('Saving...') : t('Save group order')}
        </Button>
      )}
    </section>
  )
}
