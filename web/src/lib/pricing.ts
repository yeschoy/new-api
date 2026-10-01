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
import type { PricingModel, SiteStatus } from './services'

/** How amounts are shown, derived from the operator's status settings. */
export type CurrencyDisplay = { symbol: string; rate: number }

export function currencyDisplay(status: SiteStatus | undefined): CurrencyDisplay {
  switch (status?.quota_display_type) {
    case 'CNY':
      return { symbol: '¥', rate: status.usd_exchange_rate || 7.3 }
    case 'CUSTOM':
      return {
        symbol: status.custom_currency_symbol || '¤',
        rate: status.custom_currency_exchange_rate || 1,
      }
    default:
      return { symbol: '$', rate: 1 }
  }
}

/**
 * The groups a visitor can call a model through, as /api/pricing means them: a
 * model open to "all" works in every group the visitor can use; otherwise its
 * own groups that the visitor can use. "auto" only routes between groups and has
 * no price of its own. Never empty, so the price table always has a row.
 */
export function pricedGroups(enableGroups: string[], usableGroups: string[]): string[] {
  const usable = usableGroups.filter((group) => group !== 'auto')
  if (enableGroups.includes('all')) return usable
  const allowed = enableGroups.filter((group) => usable.includes(group))
  return allowed.length ? allowed : enableGroups
}

export function isTokenPriced(model: PricingModel): boolean {
  return model.quota_type === 0
}

/**
 * USD per 1M tokens, matching the backend's billing formula:
 * model_ratio × $2 per 1M, output × completion_ratio, cache × cache_ratio.
 */
export function usdPerMillion(
  model: PricingModel,
  kind: 'input' | 'output' | 'cache',
  groupRatio = 1
): number | null {
  const base = model.model_ratio * 2 * groupRatio
  if (kind === 'input') return base
  if (kind === 'output') return base * model.completion_ratio
  if (model.cache_ratio === null || model.cache_ratio === undefined) return null
  return base * model.cache_ratio
}

export function formatAmount(usd: number, display: CurrencyDisplay): string {
  const value = usd * display.rate
  if (value === 0) return `${display.symbol}0`
  const digits = Math.abs(value) >= 1 ? 2 : 4
  const text = value.toFixed(digits).replace(/\.?0+$/, '')
  return `${display.symbol}${text}`
}

/** Input / output price pair for a model, already formatted per 1M tokens. */
export function priceSummary(
  model: PricingModel,
  display: CurrencyDisplay,
  groupRatio = 1
): { input: string; output: string; perRequest?: string } {
  if (!isTokenPriced(model)) {
    const perRequest = formatAmount((model.model_price ?? 0) * groupRatio, display)
    return { input: '—', output: '—', perRequest }
  }
  return {
    input: formatAmount(usdPerMillion(model, 'input', groupRatio) ?? 0, display),
    output: formatAmount(usdPerMillion(model, 'output', groupRatio) ?? 0, display),
  }
}
