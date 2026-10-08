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
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

/** How a create ended: how many keys were made, the full key when it was one, and why it stopped early. */
export type CreateResult = { count: number; fullKey: string; failure: string | null }

/** After creating: the new key once (with copy), or how many keys were made. */
export function KeyCreated(props: { result: CreateResult }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const result = props.result

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(result.fullKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(t('复制失败，请手动选择密钥复制'))
    }
  }

  if (result.count > 1 || result.failure) {
    return (
      <div className='flex flex-col gap-3'>
        <p className='text-[14px]'>{t('已创建 {count} 个密钥。', { count: result.count })}</p>
        {result.failure ? <Notice tone='error'>{result.failure}</Notice> : null}
        <p className='text-or-muted text-[14px]'>{t('可在列表中勾选它们，一次复制全部密钥。')}</p>
      </div>
    )
  }

  if (!result.fullKey) {
    return <p className='text-or-muted text-[14px]'>{t('密钥已创建，可在列表中点击“显示”查看完整密钥。')}</p>
  }

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-or-muted text-[14px]'>{t('请复制并妥善保存该密钥。之后也可以在列表中点击“显示”再次查看。')}</p>
      <div className='border-or-line bg-or-bg flex items-center gap-2 rounded-[6px] border p-3'>
        <code className='font-geist min-w-0 flex-1 text-[13px] break-all'>{result.fullKey}</code>
        <Button size='sm' onClick={onCopy}>
          {copied ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
          {copied ? t('已复制') : t('复制')}
        </Button>
      </div>
      {error ? <Notice tone='error'>{error}</Notice> : null}
    </div>
  )
}
