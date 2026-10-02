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
import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { formatAmount } from '@/lib/pricing'
import { useStatus } from '@/lib/queries'
import { DEFAULT_QUOTA_PER_UNIT } from '@/pages/console/console-helpers'
import { useMoney } from '@/pages/console/console-hooks'

import { OFFICIAL_USD_TO_CNY, billingPathLabel, costComparison, dynamicLineItems, priceLabel, tieredSummary } from './log-billing'
import { billedGroupRatio, formatRatio, hasCacheTokens, isDisplayableType, isViolationFee } from './log-format'
import type { LogEntry, LogOther } from './log-types'
import { useLogsView } from './logs-context'
import { DetailRow, DetailSection } from './logs-ui'

type SectionProps = { log: LogEntry; other: LogOther | null }

const count = (value: number) => value.toLocaleString('en-US')

/** Input, output, cache and image tokens. */
export function TokenSection(props: SectionProps) {
  const { t } = useI18n()
  const other = props.other
  const input = props.log.prompt_tokens || 0
  const output = props.log.completion_tokens || 0
  if (!other || !isDisplayableType(props.log.type) || (!input && !output)) return null
  const write5m = other.cache_creation_tokens_5m || 0
  const write1h = other.cache_creation_tokens_1h || 0
  const rows: Array<[string, number]> = [
    [t('输入 tokens'), input],
    [t('输出 tokens'), output],
  ]
  if (other.cache_tokens) rows.push([t('缓存读取'), other.cache_tokens])
  if (other.cache_creation_tokens && !write5m && !write1h) rows.push([t('缓存写入'), other.cache_creation_tokens])
  if (write5m) rows.push([t('缓存写入 (5m)'), write5m])
  if (write1h) rows.push([t('缓存写入 (1h)'), write1h])
  if (other.image && other.image_output) rows.push([t('图像 tokens'), other.image_output])
  return (
    <DetailSection title={t('Token 明细')}>
      {rows.map(([label, value]) => (
        <DetailRow key={label} label={label} mono>
          {count(value)}
        </DetailRow>
      ))}
    </DetailSection>
  )
}

/** Recorded prices, ratios and surcharges behind a consume charge. */
export function BillingSection(props: SectionProps) {
  const { t } = useI18n()
  const money = useMoney()
  const view = useLogsView()
  const { data: status } = useStatus()
  const other = props.other
  if (!other || isViolationFee(other)) return null
  const perMillion = (usd: number) => `${money.formatUsd(usd)}/M`
  const input = other.model_ratio != null ? other.model_ratio * 2 : 0
  const tiered = other.billing_mode === 'tiered_expr'
  const rows: Array<[string, string]> = []

  if (tiered) {
    const summary = tieredSummary(other)
    rows.push([t('计费模式'), t('动态计费')])
    rows.push([t('命中档位'), summary ? summary.tier.label || t('默认') : t('无匹配结果')])
    for (const entry of summary?.entries ?? []) rows.push([t(entry.label), perMillion(entry.price)])
  } else if ((other.model_price ?? 0) > 0) {
    rows.push([t('计费模式'), t('按次')])
    rows.push([t('模型价格'), money.formatUsd(other.model_price ?? 0)])
  } else {
    rows.push([t('计费模式'), t('按 Token')])
    if (other.model_ratio != null) rows.push([t('输入'), perMillion(input)])
    if (other.model_ratio != null && other.completion_ratio != null) rows.push([t('输出'), perMillion(input * other.completion_ratio)])
  }

  const ratio = billedGroupRatio(other)
  if (ratio) rows.push([ratio.exclusive ? t('专属倍率') : t('分组倍率'), `${formatRatio(ratio.ratio)}x`])

  if (!tiered && other.claude === true && hasCacheTokens(other)) {
    if (other.cache_ratio != null && other.cache_ratio !== 1) rows.push([t('缓存读取'), perMillion(input * other.cache_ratio)])
    if (other.cache_creation_ratio != null && other.cache_creation_ratio !== 1) rows.push([t('缓存写入'), perMillion(input * other.cache_creation_ratio)])
    if (other.cache_creation_ratio_5m) rows.push([t('缓存写入 (5m)'), perMillion(input * other.cache_creation_ratio_5m)])
    if (other.cache_creation_ratio_1h) rows.push([t('缓存写入 (1h)'), perMillion(input * other.cache_creation_ratio_1h)])
  }
  if (!tiered) {
    if (other.audio_ratio != null && other.audio_ratio !== 1) rows.push([t('音频输入'), perMillion(input * other.audio_ratio)])
    if (other.audio_completion_ratio != null && other.audio_completion_ratio !== 1) rows.push([t('音频输出'), perMillion(input * other.audio_completion_ratio)])
    if (other.image_ratio != null && other.image_ratio !== 1) rows.push([t('图像输入'), perMillion(input * other.image_ratio)])
  }

  const calls = (label: string, times: number, price?: number) => rows.push([label, `${times}x${price ? ` (${money.formatUsd(price)})` : ''}`])
  if (other.web_search && other.web_search_call_count) calls(t('网页搜索'), other.web_search_call_count, other.web_search_price)
  if (other.file_search && other.file_search_call_count) calls(t('文件搜索'), other.file_search_call_count, other.file_search_price)
  if (other.image_generation_call && other.image_generation_call_price) rows.push([t('图片生成'), money.formatUsd(other.image_generation_call_price)])
  for (const item of other.tool_surcharges ?? []) if (item?.name && item.count > 0) calls(item.name, item.count, item.price)
  if (other.audio_input_seperate_price && other.audio_input_price) rows.push([t('音频输入价格'), money.formatUsd(other.audio_input_price)])
  if (view.admin && other.admin_info) rows.push([t('计费路径'), billingPathLabel(other.admin_info)])

  const comparison = costComparison(props.log.quota, other, props.log.model_name, {
    priceRate: Math.max(Number(status?.price ?? 1), 0.001),
    quotaPerUnit: status?.quota_per_unit || DEFAULT_QUOTA_PER_UNIT,
  })
  const facts = other.usage_facts && typeof other.usage_facts === 'object' ? Object.entries(other.usage_facts) : []

  return (
    <DetailSection title={t('计费详情')}>
      {rows.map(([label, value], index) => (
        <DetailRow key={`${index}-${label}`} label={label} mono>
          {value}
        </DetailRow>
      ))}
      {facts.length ? <p className='text-or-muted pt-2 pb-0.5 text-[12px] font-semibold'>{t('用量参数')}</p> : null}
      {facts.map(([key, value]) => (
        <DetailRow key={`fact-${key}`} label={key} mono>
          {String(value)}
        </DetailRow>
      ))}
      {comparison ? (
        <DetailRow label={t('官方价（估算）')} mono>
          {comparison.currency === 'USD'
            ? formatAmount(comparison.baseCost / OFFICIAL_USD_TO_CNY, { symbol: '$', rate: 1 })
            : formatAmount(comparison.baseCost, { symbol: '¥', rate: 1 })}
        </DetailRow>
      ) : null}
      <DetailRow label={t('总费用')} mono>
        {money.format(props.log.quota)}
      </DetailRow>
    </DetailSection>
  )
}

/** Tiered billing: every tier of the expression, the request rules and how the charge adds up. */
export function DynamicSection(props: { other: LogOther | null }) {
  const { t } = useI18n()
  const money = useMoney()
  const summary = tieredSummary(props.other, { includeUnusedCache: true })
  if (!summary) return null
  const lines = dynamicLineItems(props.other)
  const rules = props.other?.request_rules ?? []
  const claude = props.other?.claude === true
  const priceList = (prices: Record<string, number>) =>
    Object.entries(prices)
      .map(([key, price]) => `${t(priceLabel(key, claude))} ${money.formatUsd(price)}`)
      .join(' · ')

  return (
    <DetailSection title={t('动态计费')}>
      {summary.tiers.map((tier) => (
        <DetailRow
          key={tier.label}
          label={
            <span className='inline-flex items-center gap-1.5'>
              {tier.label || t('默认')}
              {tier === summary.tier ? <Tag tone='success'>{t('命中')}</Tag> : null}
            </span>
          }
          mono
        >
          {`${priceList(tier.prices)} /M`}
        </DetailRow>
      ))}
      {rules.map((rule, index) => (
        <DetailRow key={`rule-${index}`} label={rule.matched ? t('命中规则') : t('未命中规则')} mono>
          {`${rule.cond} → ×${rule.multiplier}`}
        </DetailRow>
      ))}
      {lines?.items.map((item) => (
        <DetailRow key={`line-${item.key}`} label={t(item.label)} mono>
          {`${count(item.quantity)} × ${money.formatUsd(item.unitPrice)}/M${lines.multiplier !== 1 ? ` × ${lines.multiplier}` : ''} = ${money.formatUsd(item.cost)}`}
        </DetailRow>
      ))}
      {lines ? (
        <DetailRow label={t('分组倍率前')} mono>
          {money.formatUsd(lines.total)}
        </DetailRow>
      ) : null}
    </DetailSection>
  )
}
