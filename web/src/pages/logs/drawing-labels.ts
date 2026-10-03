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
import {
  Blend,
  FileText,
  HelpCircle,
  ImageIcon,
  Maximize2,
  Move,
  Paintbrush,
  RefreshCw,
  Scissors,
  Shuffle,
  Upload,
  UserRound,
  Video,
  WandSparkles,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'

import type { TagTone } from '@/components/ui'
import { t, tk } from '@/i18n/i18n'

/** Midjourney actions (constant/midjourney.go) with their icons. */
const ACTIONS: Record<string, { label: string; icon: LucideIcon }> = {
  IMAGINE: { label: tk('绘图'), icon: ImageIcon },
  UPSCALE: { label: tk('放大'), icon: Maximize2 },
  VIDEO: { label: tk('视频'), icon: Video },
  EDITS: { label: tk('编辑'), icon: Paintbrush },
  VARIATION: { label: tk('变换'), icon: Shuffle },
  HIGH_VARIATION: { label: tk('强变换'), icon: Shuffle },
  LOW_VARIATION: { label: tk('弱变换'), icon: Shuffle },
  PAN: { label: tk('平移'), icon: Move },
  DESCRIBE: { label: tk('图生文'), icon: FileText },
  BLEND: { label: tk('混合'), icon: Blend },
  UPLOAD: { label: tk('上传'), icon: Upload },
  SHORTEN: { label: tk('缩词'), icon: Scissors },
  REROLL: { label: tk('重绘'), icon: RefreshCw },
  INPAINT: { label: tk('局部重绘'), icon: WandSparkles },
  SWAP_FACE: { label: tk('换脸'), icon: UserRound },
  ZOOM: { label: tk('缩放'), icon: ZoomIn },
  CUSTOM_ZOOM: { label: tk('自定义缩放'), icon: ZoomIn },
}

export function drawingAction(action: string): { text: string; icon: LucideIcon } {
  const known = ACTIONS[action]
  return known ? { text: t(known.label), icon: known.icon } : { text: t('未知'), icon: HelpCircle }
}

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  SUCCESS: { label: tk('成功|状态'), tone: 'success' },
  NOT_START: { label: tk('未开始'), tone: 'neutral' },
  SUBMITTED: { label: tk('排队中'), tone: 'warning' },
  IN_PROGRESS: { label: tk('进行中'), tone: 'neutral' },
  FAILURE: { label: tk('失败'), tone: 'danger' },
  MODAL: { label: tk('等待中'), tone: 'warning' },
}

export function drawingStatus(status: string): { text: string; tone: TagTone } {
  const known = STATUS[status]
  return known ? { text: t(known.label), tone: known.tone } : { text: t('未知'), tone: 'neutral' }
}

/** What the Midjourney proxy answered when the task was submitted (admins). */
const SUBMIT_RESULTS: Record<number, { label: string; tone: TagTone }> = {
  1: { label: tk('已提交'), tone: 'success' },
  21: { label: tk('等待中'), tone: 'warning' },
  22: { label: tk('重复提交'), tone: 'warning' },
  0: { label: tk('未提交'), tone: 'warning' },
}

export function submitResult(code: number): { text: string; tone: TagTone } {
  const known = SUBMIT_RESULTS[code]
  return known ? { text: t(known.label), tone: known.tone } : { text: t('未知'), tone: 'neutral' }
}
