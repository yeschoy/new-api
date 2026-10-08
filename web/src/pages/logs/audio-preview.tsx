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
import { ExternalLink, Music } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button, Modal, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { CopyButton, Dash } from './logs-ui'
import { audioClips, type AudioClip } from './task-artifacts-lib'

/** 125 → "2:05". */
function clipLength(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function ClipCard(props: { clip: AudioClip }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const clip = props.clip
  const title = clip.title || t('未命名')
  const tags = clip.tags || clip.metadata?.tags || ''
  const length = clipLength(clip.duration || clip.metadata?.duration)
  const cover = clip.image_url || clip.image_large_url
  const [coverFailed, setCoverFailed] = useState(false)

  return (
    <article className='border-or-line flex gap-3 rounded-[8px] border p-3'>
      {cover && !coverFailed ? (
        <img src={cover} alt='' className='size-16 shrink-0 rounded-[6px] object-cover' onError={() => setCoverFailed(true)} />
      ) : null}
      <div className='min-w-0 flex-1'>
        <div className='mb-1 flex items-center gap-2'>
          <span className='truncate text-[14px] font-medium'>{title}</span>
          {length ? <Tag>{length}</Tag> : null}
        </div>
        {tags ? <p className='text-or-muted mb-2 truncate text-[12px]'>{tags}</p> : null}
        {failed ? (
          <div className='flex flex-wrap items-center gap-2 text-[13px]'>
            <span className='text-or-red'>{t('音频无法播放')}</span>
            <a
              href={clip.audio_url}
              target='_blank'
              rel='noopener noreferrer'
              className='border-or-line hover:bg-or-fill inline-flex h-7 items-center gap-1 rounded-[6px] border px-2 font-medium'
            >
              <ExternalLink className='size-3.5' aria-hidden='true' />
              {t('在新标签页打开')}
            </a>
            <CopyButton text={clip.audio_url} label={t('复制链接')} />
          </div>
        ) : (
          <audio src={clip.audio_url} controls preload='none' onError={() => setFailed(true)} className='h-9 w-full' />
        )}
      </div>
    </article>
  )
}

/** Old Suno tasks keep their clips in the task data; this plays them. */
export function AudioPreviewButton(props: { data: unknown }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const clips = useMemo(() => audioClips(props.data), [props.data])
  if (clips.length === 0) return <Dash />
  return (
    <>
      <Button size='sm' onClick={() => setOpen(true)}>
        <Music className='size-3.5' aria-hidden='true' />
        {t('试听')}
      </Button>
      {open ? (
        <Modal title={t('音乐预览')} onClose={() => setOpen(false)}>
          <div className='flex flex-col gap-3'>
            {clips.map((clip, index) => (
              <ClipCard key={clip.clip_id || clip.id || index} clip={clip} />
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
