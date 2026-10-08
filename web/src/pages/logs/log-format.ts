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
import { tk } from '@/i18n/i18n'

import type { LogEntry, LogOther } from './log-types'

/** model/log.go LogType*; the list and stat endpoints read type 0 as "every type". */
export const LOG_TYPE = { UNKNOWN: 0, TOPUP: 1, CONSUME: 2, MANAGE: 3, SYSTEM: 4, ERROR: 5, REFUND: 6, LOGIN: 7 } as const

const LOG_TYPES: Array<{ value: number; label: string; tone: TagTone }> = [
  { value: LOG_TYPE.TOPUP, label: tk('充值|日志类型'), tone: 'success' },
  { value: LOG_TYPE.CONSUME, label: tk('消耗'), tone: 'neutral' },
  { value: LOG_TYPE.MANAGE, label: tk('管理|日志类型'), tone: 'warning' },
  { value: LOG_TYPE.SYSTEM, label: tk('系统'), tone: 'neutral' },
  { value: LOG_TYPE.ERROR, label: tk('错误'), tone: 'danger' },
  { value: LOG_TYPE.REFUND, label: tk('退款'), tone: 'success' },
  { value: LOG_TYPE.LOGIN, label: tk('登录|日志类型'), tone: 'neutral' },
]

/** Type filter choices; '0' asks the backend for every type. */
export const LOG_TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '0', label: tk('所有类型') },
  ...LOG_TYPES.map((type) => ({ value: String(type.value), label: type.label })),
]

/** The type's label (pass it through t()) and tag tone; unknown types read 未知. */
export function logTypeOf(type: number): { label: string; tone: TagTone } {
  return LOG_TYPES.find((item) => item.value === type) ?? { label: tk('未知'), tone: 'neutral' }
}

export function parseOther(raw: string | null | undefined): LogOther | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as LogOther) : null
  } catch {
    return null
  }
}

/** Rows that carry request details (unknown, consume, error, refund). */
export function isDisplayableType(type: number): boolean {
  return [LOG_TYPE.UNKNOWN, LOG_TYPE.CONSUME, LOG_TYPE.ERROR, LOG_TYPE.REFUND].some((value) => value === type)
}

/** Rows with a duration, stream flag and first-token time (consume and error). */
export function isTimingType(type: number): boolean {
  return type === LOG_TYPE.CONSUME || type === LOG_TYPE.ERROR
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** The ratio worth showing beside the group: the user's exclusive ratio, else a non-default group ratio. */
export function displayGroupRatio(other: LogOther | null): number | null {
  if (finite(other?.user_group_ratio) && other.user_group_ratio !== -1) return other.user_group_ratio
  if (finite(other?.group_ratio) && other.group_ratio !== 1) return other.group_ratio
  return null
}

/** The ratio applied to the bill and whether it is the user's exclusive one. */
export function billedGroupRatio(other: LogOther | null): { ratio: number; exclusive: boolean } | null {
  if (finite(other?.user_group_ratio) && other.user_group_ratio !== -1) return { ratio: other.user_group_ratio, exclusive: true }
  if (finite(other?.group_ratio)) return { ratio: other.group_ratio, exclusive: false }
  return null
}

/** 2 → "2", 0.33333 → "0.3333". */
export function formatRatio(ratio: number | null | undefined): string {
  if (!finite(ratio)) return '—'
  return Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(4).replace(/\.?0+$/, '')
}

export function isViolationFee(other: LogOther | null): boolean {
  return !!other && (other.violation_fee === true || !!other.violation_fee_code || !!other.violation_fee_marker)
}

/** Error rows, violation fees and streams that broke off all count as failed requests. */
export function isFailedRequest(log: LogEntry, other: LogOther | null): boolean {
  return log.type === LOG_TYPE.ERROR || isViolationFee(other) || (log.is_stream && other?.stream_status?.status === 'error')
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0
}

/** A tool-call surcharge (web / file search, image generation) was billed on top of tokens. */
export function hasToolSurcharge(other: LogOther | null): boolean {
  if (!other) return false
  if (other.tool_surcharges?.some((item) => item?.name?.trim() && positive(item.count) && positive(item.price))) return true
  if (other.web_search === true && positive(other.web_search_call_count) && positive(other.web_search_price)) return true
  if (other.file_search === true && positive(other.file_search_call_count) && positive(other.file_search_price)) return true
  return other.image_generation_call === true && positive(other.image_generation_call_price)
}

export function hasCacheTokens(other: LogOther | null | undefined): boolean {
  if (!other) return false
  return [other.cache_tokens, other.cache_creation_tokens, other.cache_creation_tokens_5m, other.cache_creation_tokens_1h].some(positive)
}

/** Cache writes: the 5m + 1h split when recorded, else the single total. */
export function cacheWriteTokens(other: LogOther | null): number {
  const split = (other?.cache_creation_tokens_5m || 0) + (other?.cache_creation_tokens_1h || 0)
  return split > 0 ? split : other?.cache_creation_tokens || 0
}

/** The upstream model when the request was mapped to another one. */
export function mappedModel(other: LogOther | null): string | undefined {
  return other?.is_model_mapped && other.upstream_model_name ? other.upstream_model_name : undefined
}

/** 2.5 → "2.5s", 75 → "1m 15s". */
export function secondsLabel(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`
}

export type Tone = 'good' | 'warn' | 'bad'

function durationTone(seconds: number): Tone {
  if (seconds < 10) return 'good'
  if (seconds < 30) return 'warn'
  return 'bad'
}

/** Throughput once 100+ tokens came back, else the plain duration. */
export function responseTone(seconds: number, completionTokens: number): Tone {
  if (completionTokens < 100 || seconds <= 0) return durationTone(seconds)
  const perSecond = completionTokens / seconds
  if (perSecond >= 30) return 'good'
  if (perSecond >= 15) return 'warn'
  return 'bad'
}

export function firstTokenTone(seconds: number): Tone {
  if (seconds < 5) return 'good'
  if (seconds < 10) return 'warn'
  return 'bad'
}

/** Text colours for timing tones; the green "fast" accent reads on both themes. */
export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-or-red',
}

/** What masked values show while sensitive data is hidden. */
export const MASK = '••••'
