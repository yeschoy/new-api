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
import { useState } from 'react'

import { Modal } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { CopyButton, TextBlock } from './logs-ui'

/** The generated image with its address; says so when it cannot load. */
export function ImagePreviewDialog(props: { url: string; taskId: string; onClose: () => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  return (
    <Modal size='xl' title={t('图片预览')} onClose={props.onClose}>
      <p className='text-or-muted mb-3 text-[13px]'>{t('任务 ID：{id}', { id: props.taskId })}</p>
      <div className='border-or-line bg-or-fill relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-[8px] border'>
        <img
          src={props.url}
          alt={t('生成的图片')}
          loading='lazy'
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          className={cn('max-h-[60vh] w-full object-contain', state === 'ready' ? 'opacity-100' : 'opacity-0')}
        />
        {state === 'loading' ? <span className='text-or-muted absolute text-[13px]'>{t('加载中…')}</span> : null}
        {state === 'failed' ? <span className='text-or-red absolute text-[13px]'>{t('图片加载失败')}</span> : null}
      </div>
      <div className='border-or-line bg-or-fill mt-3 flex items-start gap-2 rounded-[6px] border p-2.5'>
        <p className='font-geist min-w-0 flex-1 text-[12px] break-all'>{props.url}</p>
        <CopyButton text={props.url} label={t('复制链接')} />
      </div>
    </Modal>
  )
}

/** The whole prompt and, when the proxy translated it, the English one. */
export function PromptDialog(props: { prompt: string; promptEn?: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal title={t('提示词详情')} onClose={props.onClose}>
      <div className='flex flex-col gap-4'>
        <TextBlock title={t('提示词')} text={props.prompt} />
        {props.promptEn ? <TextBlock title={t('提示词（英文）')} text={props.promptEn} /> : null}
      </div>
    </Modal>
  )
}

/** The whole error message of a failed drawing. */
export function FailReasonDialog(props: { reason: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal title={t('失败原因')} onClose={props.onClose}>
      <TextBlock title={t('错误信息')} text={props.reason} />
    </Modal>
  )
}
