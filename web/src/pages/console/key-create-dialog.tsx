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
import { Check, Copy, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { unwrap } from '@/lib/console-api'
import { cn } from '@/lib/format'
import { createKey, revealKey, type ApiKey } from '@/lib/services'

import { withKeyPrefix } from './console-helpers'
import { useMoney } from './console-hooks'
import { Button, Field, Notice, TextInput } from './console-ui'

/** Modal: name + optional credit limit; afterwards shows the new key once. */
export function CreateKeyDialog(props: { onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const titleId = useId()
  const nameId = useId()
  const limitId = useId()
  const [name, setName] = useState('')
  const [unlimited, setUnlimited] = useState(true)
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const onClose = props.onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const create = useMutation({
    mutationFn: async (remainQuota: number) => {
      const body = await createKey({ name: name.trim(), remain_quota: remainQuota, unlimited_quota: unlimited, expired_time: -1 })
      const key = unwrap(body, t('创建失败')) as ApiKey | null
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      if (!key?.id) return ''
      try {
        return withKeyPrefix(await revealKey(key.id))
      } catch {
        return ''
      }
    },
    onSuccess: (fullKey) => setCreated(fullKey),
    onError: (err) => setFormError(errorMessage(err, t('创建失败'))),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!name.trim()) return setFormError(t('请输入密钥名称'))
    const remainQuota = unlimited ? 0 : money.toQuota(Number(amount))
    if (!unlimited && remainQuota <= 0) return setFormError(t('请输入大于 0 的额度上限'))
    create.mutate(remainQuota)
  }

  async function onCopy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setFormError(t('复制失败，请手动选择密钥复制'))
    }
  }

  return (
    <div
      className='fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        className='border-or-line bg-or-card text-or-fg relative w-full max-w-[460px] rounded-[12px] border p-6 shadow-2xl'
      >
        <button type='button' onClick={props.onClose} aria-label={t('关闭')} className='text-or-muted hover:bg-or-fill absolute top-4 right-4 flex size-7 items-center justify-center rounded-[6px]'>
          <X className='size-4' />
        </button>
        <h2 id={titleId} className='text-[16px] font-semibold'>
          {created === null ? t('创建 API 密钥') : t('密钥已创建')}
        </h2>

        {created === null ? (
          <form onSubmit={onSubmit} className='mt-5 flex flex-col gap-4'>
            <Field label={t('名称')} htmlFor={nameId}>
              <TextInput id={nameId} value={name} onChange={setName} placeholder={t('例如：生产环境')} maxLength={50} autoFocus />
            </Field>
            <Field label={t('额度上限')} htmlFor={limitId} hint={unlimited ? t('该密钥可使用账户的全部余额。') : t('用完后该密钥将停止工作，账户余额不受影响。')}>
              <div className='flex items-center gap-2 text-[14px]'>
                <button
                  id={unlimited ? limitId : undefined}
                  type='button'
                  role='switch'
                  aria-checked={unlimited}
                  aria-label={t('不限额度')}
                  onClick={() => setUnlimited(!unlimited)}
                  className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', unlimited ? 'bg-or-primary' : 'bg-or-fg/20')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', unlimited ? 'bg-or-bg translate-x-4' : 'bg-white')} />
                </button>
                <span>{t('不限额度')}</span>
              </div>
              {unlimited ? null : (
                <div className='relative mt-1'>
                  <span className='text-or-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px]'>{money.symbol}</span>
                  <TextInput id={limitId} value={amount} onChange={setAmount} inputMode='decimal' placeholder='10' className='pl-7' />
                </div>
              )}
            </Field>
            {formError ? <Notice tone='error'>{formError}</Notice> : null}
            <div className='mt-1 flex justify-end gap-2'>
              <Button onClick={props.onClose}>{t('取消')}</Button>
              <Button type='submit' variant='primary' busy={create.isPending}>
                {t('创建')}
              </Button>
            </div>
          </form>
        ) : (
          <div className='mt-4 flex flex-col gap-4'>
            {created ? (
              <>
                <p className='text-or-muted text-[14px]'>{t('请复制并妥善保存该密钥。之后也可以在列表中点击“显示”再次查看。')}</p>
                <div className='border-or-line bg-or-bg flex items-center gap-2 rounded-[6px] border p-3'>
                  <code className='font-geist min-w-0 flex-1 text-[13px] break-all'>{created}</code>
                  <Button size='sm' onClick={onCopy}>
                    {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
                    {copied ? t('已复制') : t('复制')}
                  </Button>
                </div>
              </>
            ) : (
              <p className='text-or-muted text-[14px]'>{t('密钥已创建，可在列表中点击“显示”查看完整密钥。')}</p>
            )}
            {formError ? <Notice tone='error'>{formError}</Notice> : null}
            <div className='flex justify-end'>
              <Button variant='primary' onClick={props.onClose}>
                {t('完成')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
