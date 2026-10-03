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
import type { TagTone } from '@/components/ui'
import { t, tk } from '@/i18n/i18n'

/** Task status (constant/task.go); unknown values are shown as sent. */
const STATUS: Record<string, { label: string; tone: TagTone }> = {
  SUCCESS: { label: tk('成功|状态'), tone: 'success' },
  NOT_START: { label: tk('未开始'), tone: 'neutral' },
  SUBMITTED: { label: tk('排队中'), tone: 'warning' },
  QUEUED: { label: tk('排队中'), tone: 'warning' },
  IN_PROGRESS: { label: tk('进行中'), tone: 'neutral' },
  FAILURE: { label: tk('失败'), tone: 'danger' },
  UNKNOWN: { label: tk('未知'), tone: 'neutral' },
}

export function taskStatus(status: string): { text: string; tone: TagTone } {
  const known = STATUS[status]
  if (known) return { text: t(known.label), tone: known.tone }
  return { text: status || t('提交中'), tone: 'neutral' }
}

/** Task actions (constant/task.go); Suno's are upper case, the video ones camelCase. */
const ACTIONS: Record<string, string> = {
  MUSIC: tk('生成音乐'),
  LYRICS: tk('生成歌词'),
  generate: tk('图生视频'),
  textGenerate: tk('文生视频'),
  firstTailGenerate: tk('首尾生视频'),
  referenceGenerate: tk('参照生视频'),
  remixGenerate: tk('视频 Remix'),
}

export function taskAction(action: string): string {
  return ACTIONS[action] ? t(ACTIONS[action]) : action
}

/** Seconds between two timestamps in the same unit, or null until the task finished. */
export function taskDuration(submit: number | undefined, finish: number | undefined, unit: 'seconds' | 'ms'): number | null {
  if (!submit || !finish) return null
  return unit === 'ms' ? (finish - submit) / 1000 : finish - submit
}
