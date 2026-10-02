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
import { t, tk } from '@/i18n/i18n'

import { hasCacheTokens, isViolationFee } from './log-format'
import type { LogAdminInfo, LogOther } from './log-types'
import { referenceCurrency } from './model-reference'

/** Price variables of a tiered billing expression, in USD per million units. */
const PRICE_VARS: Array<{ key: string; label: string; cache?: boolean }> = [
  { key: 'p', label: tk('输入') },
  { key: 'c', label: tk('输出') },
  { key: 'cr', label: tk('缓存读取'), cache: true },
  { key: 'cc', label: tk('缓存写入'), cache: true },
  { key: 'cc1h', label: tk('缓存写入 (1h)'), cache: true },
  { key: 'img', label: tk('图像输入') },
  { key: 'img_o', label: tk('图像输出') },
  { key: 'ai', label: tk('音频输入') },
  { key: 'ao', label: tk('音频输出') },
]

const VAR_PATTERN = /\b(p|c|cr|cc|cc1h|img|img_o|ai|ao)\s*\*\s*([\d.eE+-]+)/g
const CONDITION = '(?:(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)'
const TIER_PATTERN = new RegExp(`(?:${CONDITION}(?:\\s*&&\\s*${CONDITION})*\\s*\\?\\s*)?tier\\("([^"]*)",\\s*([^)]+)\\)`, 'g')

export type Tier = { label: string; prices: Record<string, number> }

/** The base64 billing expression the log recorded (missing or broken → ''). */
export function decodeExpr(b64: string | undefined): string {
  if (!b64) return ''
  try {
    const binary = window.atob(b64)
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch {
    return ''
  }
}

/** The tiers of an expression such as `len <= 200000 ? tier("short", p * 2.5 + c * 15) : tier("long", …)`. */
export function parseTiers(expr: string): Tier[] {
  const body = expr.replace(/^v\d+:/, '')
  const tiers: Tier[] = []
  for (const match of body.matchAll(TIER_PATTERN)) {
    const prices: Record<string, number> = {}
    for (const price of match[2].matchAll(VAR_PATTERN)) {
      if (!(price[1] in prices)) prices[price[1]] = Number(price[2])
    }
    tiers.push({ label: match[1], prices })
  }
  return tiers
}

function normalizeLabel(label: string | undefined): string {
  if (!label) return ''
  return label
    .replace(/<[=＝]?|≤|＜[=＝]?/g, '<')
    .replace(/>[=＝]?|≥|＞[=＝]?/g, '>')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export type TierEntry = { key: string; label: string; price: number }
export type TieredSummary = { tiers: Tier[]; tier: Tier; entries: TierEntry[] }

/** The tier a tiered-billing log was charged at, with its prices. Never guesses a tier the log did not record. */
export function tieredSummary(other: LogOther | null, options: { includeUnusedCache?: boolean } = {}): TieredSummary | null {
  if (!other || other.billing_mode !== 'tiered_expr') return null
  const tiers = parseTiers(decodeExpr(other.expr_b64))
  const wanted = normalizeLabel(other.matched_tier)
  const tier = wanted ? tiers.find((item) => normalizeLabel(item.label) === wanted) : undefined
  if (!tier) return null
  const showCache = options.includeUnusedCache || hasCacheTokens(other)
  const entries: TierEntry[] = []
  for (const variable of PRICE_VARS) {
    const price = tier.prices[variable.key]
    if (price === undefined || !Number.isFinite(price) || price < 0) continue
    if (variable.cache && !showCache) continue
    const label = variable.key === 'cc' && other.claude === true ? tk('缓存写入 (5m)') : variable.label
    entries.push({ key: variable.key, label, price })
  }
  return { tiers, tier, entries }
}

export type LineItem = { key: string; label: string; quantity: number; unitPrice: number; cost: number }

/** Quantity × tier price × matched request-rule multipliers, only when it adds up to the recorded charge. */
export function dynamicLineItems(other: LogOther | null): { items: LineItem[]; multiplier: number; total: number } | null {
  const summary = tieredSummary(other, { includeUnusedCache: true })
  const usage = other?.billing_usage
  const recorded = other?.billing_cost_before_group
  if (!summary || !usage || typeof recorded !== 'number' || !Number.isFinite(recorded) || recorded < 0) return null
  let multiplier = 1
  for (const rule of other?.request_rules ?? []) {
    if (!rule.matched) continue
    if (typeof rule.multiplier !== 'number' || !Number.isFinite(rule.multiplier) || rule.multiplier < 0) return null
    multiplier *= rule.multiplier
  }
  const items: LineItem[] = []
  let sum = 0
  for (const entry of summary.entries) {
    const quantity = usage[entry.key]
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null
    if (quantity === 0) continue
    const cost = (quantity * entry.price * multiplier) / 1_000_000
    sum += cost
    items.push({ key: entry.key, label: entry.label, quantity, unitPrice: entry.price, cost })
  }
  if (items.length === 0 || !Number.isFinite(sum)) return null
  if (Math.abs(sum - recorded) > Math.max(1e-12, Math.abs(recorded) * 1e-9)) return null
  return { items, multiplier, total: recorded }
}

/** A violation fee replaces the request charge. */
export function chargedQuota(quota: number, other: LogOther | null): number {
  const fee = other?.fee_quota
  return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 ? fee : quota
}

/** USD → CNY rate the old site used for official-price comparisons (independent of wallet billing). */
export const OFFICIAL_USD_TO_CNY = 6.75

export type CostComparison = { baseCost: number; siteCost: number; savings: number; currency?: 'CNY' | 'USD' }

/**
 * The charge against the recorded base price (group ratio taken out), both in
 * CNY. The reference currency follows the model family; null unless cheaper.
 * Historical logs are never repriced with today's model settings.
 */
export function costComparison(
  quota: number,
  other: LogOther | null,
  modelName: string,
  rates: { priceRate: number; quotaPerUnit: number }
): CostComparison | null {
  if (!other || other.billing_source === 'subscription' || isViolationFee(other) || (other.model_price ?? 0) > 0) return null
  const userRatio = other.user_group_ratio
  const ratio = typeof userRatio === 'number' && userRatio > 0 ? userRatio : other.group_ratio
  const charged = chargedQuota(quota, other)
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || charged < 0) return null
  if (!(rates.priceRate > 0) || !(rates.quotaPerUnit > 0)) return null
  const currency = referenceCurrency(modelName)
  let referenceRate = rates.priceRate
  if (currency === 'USD') referenceRate = OFFICIAL_USD_TO_CNY
  if (currency === 'CNY') referenceRate = 1
  const siteCost = (charged / rates.quotaPerUnit) * rates.priceRate
  const baseCost = (charged / ratio / rates.quotaPerUnit) * referenceRate
  const savings = baseCost - siteCost
  if (!Number.isFinite(savings) || savings <= 0) return null
  return { baseCost, siteCost, savings, currency }
}

const UPSTREAM_SOURCES = [
  'billing-usage-openai',
  'billing-usage-openai-estimated',
  'billing-usage-anthropic',
  'billing-usage-anthropic-estimated',
  'billing-usage-gemini',
  'billing-usage-gemini-estimated',
]

export function isLocalBilling(admin: LogAdminInfo | undefined): boolean {
  if (admin?.usage_billing_path) return admin.usage_billing_path === 'local'
  return admin?.local_count_tokens === true
}

/** Where the token counts behind the bill came from (admins only). */
export function billingPathLabel(admin: LogAdminInfo | undefined): string {
  const path = admin?.usage_billing_path
  if (path && UPSTREAM_SOURCES.includes(path)) return t('上游返回（{source}）', { source: path })
  return isLocalBilling(admin) ? t('本地计费') : t('上游返回')
}
