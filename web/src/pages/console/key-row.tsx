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
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { errorMessage } from '@/lib/api'
import { KEY_STATUS_DISABLED, KEY_STATUS_ENABLED, setKeyStatus, unwrap } from '@/lib/console-api'
import { cn, dateTime } from '@/lib/format'
import { deleteKey, revealKey, type ApiKey } from '@/lib/services'

import { keyStatusLabel, withKeyPrefix } from './console-helpers'
import { useMoney } from './console-hooks'
import { Td, Tr } from './console-table'
import { Button, Tag, useIsRouter, useMutedText } from './console-ui'

/** One key: masked value with reveal / copy, limits, and row actions. */
export function KeyRow(props: { apiKey: ApiKey }) {
  const key = props.apiKey
  const router = useIsRouter()
  const muted = useMutedText()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [fullKey, setFullKey] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['console'] })
  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteKey(key.id), '删除失败'),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err, '删除失败')),
  })
  const enabled = key.status === KEY_STATUS_ENABLED
  const toggle = useMutation({
    mutationFn: () => setKeyStatus(key.id, enabled ? KEY_STATUS_DISABLED : KEY_STATUS_ENABLED),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err, '操作失败')),
  })

  async function loadFullKey(): Promise<string> {
    if (fullKey) return fullKey
    const value = withKeyPrefix(await revealKey(key.id))
    if (!value) throw new Error('获取密钥失败')
    setFullKey(value)
    return value
  }

  async function onReveal() {
    setError(null)
    if (shown) {
      setShown(false)
      return
    }
    try {
      await loadFullKey()
      setShown(true)
    } catch (err) {
      setError(errorMessage(err, '获取密钥失败'))
    }
  }

  async function onCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(await loadFullKey())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      setError(errorMessage(err, '复制失败'))
    }
  }

  const status = keyStatusLabel(key.status)
  const iconButton = cn('flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors', router ? 'text-or-muted hover:bg-or-fill hover:text-or-fg' : 'text-[#626773] hover:bg-black/[0.04] hover:text-hub-link')

  return (
    <Tr>
      <Td>
        <div className='flex items-center gap-2'>
          <span className='max-w-[200px] truncate font-medium'>{key.name || '未命名'}</span>
          {status ? <Tag tone={key.status === KEY_STATUS_DISABLED ? 'neutral' : 'danger'}>{status}</Tag> : null}
        </div>
      </Td>
      <Td>
        <div className='flex items-center gap-1'>
          <code className={cn('font-geist mr-1 text-[13px] break-all', shown ? '' : muted)}>
            {shown && fullKey ? fullKey : withKeyPrefix(key.key)}
          </code>
          <button type='button' onClick={onReveal} className={iconButton} aria-label={shown ? '隐藏密钥' : '显示密钥'} title={shown ? '隐藏' : '显示'}>
            {shown ? <EyeOff className='size-3.5' /> : <Eye className='size-3.5' />}
          </button>
          <button type='button' onClick={onCopy} className={iconButton} aria-label='复制密钥' title={copied ? '已复制' : '复制'}>
            {copied ? <Check className={cn('size-3.5', router ? 'text-or-lime' : 'text-[#52c41a]')} /> : <Copy className='size-3.5' />}
          </button>
        </div>
      </Td>
      <Td right>
        {key.unlimited_quota ? (
          <span className={muted}>无限制</span>
        ) : (
          <div className='flex flex-col items-end'>
            <span>{money.format(key.remain_quota + key.used_quota)}</span>
            <span className={cn('text-[12px]', muted)}>剩余 {money.format(key.remain_quota)}</span>
          </div>
        )}
      </Td>
      <Td right>{money.format(key.used_quota)}</Td>
      <Td muted className='whitespace-nowrap'>{dateTime(key.created_time)}</Td>
      <Td right>
        <div className='flex items-center justify-end gap-1'>
          {confirming ? (
            <>
              <span className={cn('mr-1 text-[13px] whitespace-nowrap', muted)}>确认删除？</span>
              <Button size='sm' variant='danger' busy={remove.isPending} onClick={() => remove.mutate()}>
                删除
              </Button>
              <Button size='sm' variant='ghost' onClick={() => setConfirming(false)}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button size='sm' variant='ghost' busy={toggle.isPending} onClick={() => toggle.mutate()}>
                {enabled ? '禁用' : '启用'}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className={router ? 'hover:text-or-red' : 'hover:text-[#ff4d4f]'}
                onClick={() => {
                  setError(null)
                  setConfirming(true)
                }}
              >
                删除
              </Button>
            </>
          )}
        </div>
        {error ? <div className={cn('mt-1 text-[12px]', router ? 'text-or-red' : 'text-[#ff4d4f]')}>{error}</div> : null}
      </Td>
    </Tr>
  )
}
