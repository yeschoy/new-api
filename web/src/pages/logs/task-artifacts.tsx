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
import { useQuery } from '@tanstack/react-query'
import { Download, File, Image, Music, PackageOpen, Play, RefreshCw, Video, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { AudioPreviewButton } from './audio-preview'
import type { TaskLog } from './log-types'
import { getTaskArtifacts } from './logs-api'
import { Dash } from './logs-ui'
import { previewMode, type ArtifactType, type TaskArtifact } from './task-artifacts-lib'

const KINDS: Record<ArtifactType, { icon: LucideIcon; label: string }> = {
  image: { icon: Image, label: tk('图像') },
  video: { icon: Video, label: tk('视频') },
  audio: { icon: Music, label: tk('音频') },
  file: { icon: File, label: tk('文件') },
}

/** A media element that offers a retry when the link fails to load. */
function Media(props: { type: ArtifactType; url: string; label: string }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (props.type === 'file') return null
  if (failed) {
    return (
      <div className='border-or-red/30 bg-or-red/5 text-or-red flex flex-wrap items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-[13px]'>
        {t('媒体预览失败，请重试。')}
        <Button
          size='sm'
          onClick={() => {
            setFailed(false)
            setAttempt(attempt + 1)
          }}
        >
          <RefreshCw className='size-3.5' aria-hidden='true' />
          {t('重试')}
        </Button>
      </div>
    )
  }
  const onError = () => setFailed(true)
  if (props.type === 'image') return <img key={attempt} src={props.url} alt={props.label} loading='lazy' onError={onError} className='max-h-[60vh] w-full rounded-[6px] object-contain' />
  if (props.type === 'video') return <video key={attempt} src={props.url} controls preload='metadata' onError={onError} className='max-h-[60vh] w-full rounded-[6px] bg-black' />
  return <audio key={attempt} src={props.url} controls preload='none' onError={onError} className='w-full' />
}

function ArtifactCard(props: { artifact: TaskArtifact }) {
  const { t } = useI18n()
  const kind = KINDS[props.artifact.type]
  const Icon = kind.icon
  return (
    <article className='border-or-line flex min-w-0 flex-col gap-3 rounded-[8px] border p-3'>
      <header className='flex min-w-0 items-start justify-between gap-2'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1.5 text-[14px] font-medium'>
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            {t(kind.label)}
          </div>
          <div className='text-or-dim font-geist truncate text-[12px]'>{props.artifact.key}</div>
          {props.artifact.mime_type ? <div className='text-or-dim font-geist truncate text-[11px]'>{props.artifact.mime_type}</div> : null}
        </div>
        <a
          href={props.artifact.content_url}
          download={props.artifact.key}
          target='_blank'
          rel='noopener noreferrer'
          className='border-or-line hover:bg-or-fill inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-[13px] font-medium'
        >
          <Download className='size-3.5' aria-hidden='true' />
          {t('下载')}
        </a>
      </header>
      <Media type={props.artifact.type} url={props.artifact.content_url} label={props.artifact.key} />
    </article>
  )
}

/** Loads the artifacts of one finished task; falls back to the old video link, else says there are none. */
function ArtifactsDialog(props: { taskId: string; title: string; onClose: () => void }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: useConsoleKey('task-artifacts', props.taskId),
    queryFn: () => getTaskArtifacts(props.taskId),
    retry: false,
    staleTime: 30_000,
  })
  const artifacts = query.data?.artifacts ?? []
  const legacy = query.data?.legacyContentUrl

  return (
    <Modal size='xl' title={props.title} onClose={props.onClose}>
      {query.isPending ? <p className='text-or-muted py-10 text-center text-[14px]'>{t('加载中…')}</p> : null}
      {query.isError ? (
        <div className='flex flex-col items-center gap-3 py-8 text-center'>
          <p className='text-or-red text-[14px]'>{t('制品加载失败')}</p>
          <Button size='sm' busy={query.isFetching} onClick={() => void query.refetch()}>
            {t('重试')}
          </Button>
        </div>
      ) : null}
      {query.isSuccess && artifacts.length === 0 && legacy ? <Media type='video' url={legacy} label={props.taskId} /> : null}
      {query.isSuccess && artifacts.length === 0 && !legacy ? (
        <p className='text-or-muted flex flex-col items-center gap-2 py-10 text-center text-[14px]'>
          <PackageOpen className='size-6' aria-hidden='true' />
          {t('这个任务没有制品。')}
        </p>
      ) : null}
      {artifacts.length > 0 ? (
        <div className={cn('grid gap-3', artifacts.length > 1 && 'lg:grid-cols-2')}>
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.key} artifact={artifact} />
          ))}
        </div>
      ) : null}
    </Modal>
  )
}

/** The artifacts column: plugin artifacts, an old video, or old Suno clips; nothing until the task succeeded. */
export function TaskArtifactsCell(props: { log: TaskLog }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const mode = previewMode(props.log)
  if (mode === 'none') return <Dash />
  if (mode === 'legacy-suno') return <AudioPreviewButton data={props.log.data} />
  const video = mode === 'legacy-video'
  return (
    <>
      <Button size='sm' onClick={() => setOpen(true)}>
        {video ? <Play className='size-3.5' aria-hidden='true' /> : <PackageOpen className='size-3.5' aria-hidden='true' />}
        {video ? t('预览视频') : t('制品')}
      </Button>
      {open ? <ArtifactsDialog taskId={props.log.task_id} title={video ? t('预览视频') : t('制品')} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
