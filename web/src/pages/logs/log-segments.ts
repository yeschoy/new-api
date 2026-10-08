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
import { t } from '@/i18n/i18n'

import { auditContent } from './log-audit'
import { tieredSummary } from './log-billing'
import { LOG_TYPE, billedGroupRatio, formatRatio, hasCacheTokens, isViolationFee } from './log-format'
import type { LogEntry, LogOther } from './log-types'

export type Segment = { text: string; tone?: 'muted' | 'danger' }

type Money = { formatUsd: (usd: number) => string; format: (quota: number | undefined) => string }

const CACHE_KEYS = ['cr', 'cc', 'cc1h']

function tieredSegments(other: LogOther, money: Money): Segment[] {
  const summary = tieredSummary(other)
  if (!summary) return [{ text: `${t('动态计费')} · ${t('无匹配结果')}`, tone: 'muted' }]
  const base = summary.entries.filter((entry) => entry.key === 'p' || entry.key === 'c').map((entry) => money.formatUsd(entry.price))
  const cache = summary.entries.filter((entry) => CACHE_KEYS.includes(entry.key)).map((entry) => money.formatUsd(entry.price))
  const rest = summary.entries
    .filter((entry) => entry.key !== 'p' && entry.key !== 'c' && !CACHE_KEYS.includes(entry.key))
    .map((entry) => `${t(entry.label)} ${money.formatUsd(entry.price)}/M`)
  const segments: Segment[] = []
  if (base.length) segments.push({ text: `${summary.tier.label || t('默认')} · ${base.join(' / ')}/M` })
  if (cache.length) segments.push({ text: `${t('缓存')} ${cache.join(' / ')}`, tone: 'muted' })
  if (rest.length) segments.push({ text: rest.join(' · '), tone: 'muted' })
  return segments
}

function cachePrices(other: LogOther, input: number): number[] {
  const prices: number[] = []
  if (other.cache_ratio != null && other.cache_ratio !== 1) prices.push(input * other.cache_ratio)
  if (other.cache_creation_ratio != null && other.cache_creation_ratio !== 1) prices.push(input * other.cache_creation_ratio)
  if (other.cache_creation_ratio_1h != null && other.cache_creation_ratio_1h !== 0) prices.push(input * other.cache_creation_ratio_1h)
  return prices
}

function priceSegments(other: LogOther, money: Money): Segment[] {
  if (other.billing_mode === 'tiered_expr') return tieredSegments(other, money)
  if ((other.model_price ?? 0) > 0) return [{ text: `${t('按次')} · ${money.formatUsd(other.model_price ?? 0)}` }]
  if (other.model_ratio != null) {
    // model_ratio × $2 is the input price per million tokens.
    const input = other.model_ratio * 2
    const prices = [money.formatUsd(input)]
    if (other.completion_ratio != null) prices.push(money.formatUsd(input * other.completion_ratio))
    const segments: Segment[] = [{ text: `${t('标准')} · ${prices.join(' / ')}/M` }]
    const cache = hasCacheTokens(other) ? cachePrices(other, input) : []
    if (cache.length) segments.push({ text: `${t('缓存')} ${cache.map(money.formatUsd).join(' / ')}`, tone: 'muted' })
    return segments
  }
  const ratio = billedGroupRatio(other)
  if (!ratio) return []
  return [{ text: `${ratio.exclusive ? t('专属倍率') : t('分组倍率')} ${formatRatio(ratio.ratio)}x` }]
}

function typeSegments(log: LogEntry, other: LogOther | null, money: Money): Segment[] {
  if (log.type === LOG_TYPE.MANAGE || log.type === LOG_TYPE.LOGIN) {
    const text = auditContent(other)
    return text ? [{ text }] : []
  }
  if (log.type === LOG_TYPE.REFUND) return [{ text: t('异步任务退款') }]
  if (log.type !== LOG_TYPE.CONSUME || !other) return []
  if (isViolationFee(other)) {
    const segments: Segment[] = [{ text: t('违规扣费'), tone: 'danger' }]
    if (other.violation_fee_code) segments.push({ text: other.violation_fee_code, tone: 'muted' })
    segments.push({ text: `${t('扣费')} ${money.format(other.fee_quota ?? log.quota)}`, tone: 'muted' })
    return segments
  }
  const segments = priceSegments(other, money)
  if (other.is_system_prompt_overwritten) segments.push({ text: t('系统提示词已覆盖'), tone: 'danger' })
  return segments
}

/** The short summary in the details column: the price basis, an audit text, a refund or a fee. */
export function detailSegments(log: LogEntry, other: LogOther | null, context: Money & { admin: boolean }): Segment[] {
  const lead: Segment[] = []
  const admin = context.admin ? other?.admin_info : undefined
  if (admin?.quota_saturation) lead.push({ text: t('额度已钳制'), tone: 'danger' })
  if (admin?.task_plugin) {
    const plugin = admin.task_plugin
    lead.push({ text: `${t('插件')}: ${plugin.name || plugin.key}${plugin.version ? ` @ ${plugin.version}` : ''}` })
  }
  return [...lead, ...typeSegments(log, other, context)]
}
