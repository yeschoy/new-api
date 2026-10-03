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
import type { SiteStatus } from '@/lib/services'

/** One entry of `pay_methods`: an epay channel (alipay, wxpay, custom…), Stripe or Waffo Pancake. */
export type PayMethod = { name: string; type: string; icon?: string; min_topup: number }

/** One entry of `waffo_pay_methods`; it is paid by its index in that list. */
export type WaffoMethod = { name: string; icon?: string }

/** One entry of `creem_products`; `quota` is credited as is, `price` is in `currency`. */
export type CreemProduct = { name: string; productId: string; price: number; quota: number; currency: 'USD' | 'EUR' }

/** /api/user/topup/info (controller/topup.go GetTopUpInfo) with its lists parsed. */
export type WalletInfo = {
  enable_online_topup: boolean
  enable_stripe_topup: boolean
  enable_creem_topup: boolean
  enable_waffo_topup: boolean
  enable_waffo_pancake_topup: boolean
  enable_redemption: boolean
  payment_compliance_confirmed: boolean
  pay_methods: PayMethod[]
  waffo_pay_methods: WaffoMethod[]
  creem_products: CreemProduct[]
  min_topup: number
  stripe_min_topup: number
  waffo_min_topup: number
  waffo_pancake_min_topup: number
  amount_options: number[]
  /** Price multiplier per top-up amount, e.g. { 100: 0.9 }. */
  discount: Record<number, number>
  topup_link?: string
}

export type Preset = { value: number; discount: number }

type Raw = Record<string, unknown>

/** Amounts offered when the operator configured none: multiples of the minimum. */
const PRESET_MULTIPLIERS = [1, 5, 10, 30, 50, 100, 300, 500]

/** Gateways that are not epay channels; every other `type` is paid through epay. */
const OWN_GATEWAYS = new Set(['stripe', 'creem', 'waffo', 'waffo_pancake'])

function fromJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function record(value: unknown): Raw {
  const parsed = fromJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Raw) : {}
}

function list(value: unknown): Raw[] {
  const parsed = fromJson(value)
  return Array.isArray(parsed) ? parsed.map(record) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** A number, or a numeric string as the Go maps of strings send them; NaN otherwise. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return Number.NaN
}

function num(value: unknown): number {
  const parsed = toNumber(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function numbers(value: unknown): number[] {
  const parsed = fromJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map(toNumber).filter((item) => Number.isFinite(item) && item > 0)
}

function discounts(value: unknown): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [key, rate] of Object.entries(record(value))) {
    const amount = Number(key)
    const parsed = toNumber(rate)
    if (Number.isFinite(amount) && Number.isFinite(parsed)) out[amount] = parsed
  }
  return out
}

export function parseWalletInfo(raw: unknown): WalletInfo {
  const data = record(raw)
  return {
    enable_online_topup: data.enable_online_topup === true,
    enable_stripe_topup: data.enable_stripe_topup === true,
    enable_creem_topup: data.enable_creem_topup === true,
    enable_waffo_topup: data.enable_waffo_topup === true,
    enable_waffo_pancake_topup: data.enable_waffo_pancake_topup === true,
    enable_redemption: data.enable_redemption === true,
    payment_compliance_confirmed: data.payment_compliance_confirmed !== false,
    // Waffo is listed here too, but is paid through its own list of methods.
    pay_methods: list(data.pay_methods)
      .map((item) => ({ name: text(item.name), type: text(item.type), icon: text(item.icon) || undefined, min_topup: num(item.min_topup) }))
      .filter((item) => item.name && item.type && item.type !== 'waffo'),
    waffo_pay_methods: list(data.waffo_pay_methods)
      .map((item) => ({ name: text(item.name), icon: text(item.icon) || undefined }))
      .filter((item) => item.name),
    creem_products: list(data.creem_products)
      .map((item): CreemProduct => ({
        name: text(item.name),
        productId: text(item.productId),
        price: num(item.price),
        quota: num(item.quota),
        currency: item.currency === 'EUR' ? 'EUR' : 'USD',
      }))
      .filter((item) => item.name && item.productId),
    min_topup: num(data.min_topup),
    stripe_min_topup: num(data.stripe_min_topup),
    waffo_min_topup: num(data.waffo_min_topup),
    waffo_pancake_min_topup: num(data.waffo_pancake_min_topup),
    amount_options: numbers(data.amount_options),
    discount: discounts(data.discount),
    topup_link: text(data.topup_link) || undefined,
  }
}

export function isEpayMethod(type: string): boolean {
  return !OWN_GATEWAYS.has(type)
}

/** The listed methods whose gateway is configured; the server lists epay channels even when epay is not. */
export function usableMethods(info: WalletInfo): PayMethod[] {
  return info.pay_methods.filter((method) => {
    if (method.type === 'stripe') return info.enable_stripe_topup
    if (method.type === 'waffo_pancake') return info.enable_waffo_pancake_topup
    if (isEpayMethod(method.type)) return info.enable_online_topup
    return false
  })
}

/** Any amount-based gateway (everything but Creem, which sells fixed products). */
export function amountTopUpEnabled(info: WalletInfo): boolean {
  return info.enable_online_topup || info.enable_stripe_topup || info.enable_waffo_topup || info.enable_waffo_pancake_topup
}

/** The smallest amount the first switched-on gateway accepts, at least 1. */
export function minTopUp(info: WalletInfo): number {
  let min = 1
  if (info.enable_online_topup) min = info.min_topup
  else if (info.enable_stripe_topup) min = info.stripe_min_topup
  else if (info.enable_waffo_topup) min = info.waffo_min_topup
  else if (info.enable_waffo_pancake_topup) min = info.waffo_pancake_min_topup
  return Math.max(1, min)
}

/** Epay channels are held to the site minimum (the server checks it); other gateways to their own. */
export function methodMin(info: WalletInfo, method: PayMethod): number {
  if (method.type === 'stripe') return Math.max(1, method.min_topup || info.stripe_min_topup)
  if (method.type === 'waffo_pancake') return Math.max(1, method.min_topup || info.waffo_pancake_min_topup)
  return Math.max(1, method.min_topup, info.min_topup)
}

/** A payment button: a listed method, or a Waffo method paid by its index. */
export type MethodChoice = { type: string; name: string; icon?: string; min: number; waffoIndex?: number }

export function methodChoices(info: WalletInfo): MethodChoice[] {
  const listed = usableMethods(info).map((method) => ({ type: method.type, name: method.name, icon: method.icon, min: methodMin(info, method) }))
  if (!info.enable_waffo_topup) return listed
  const waffo = info.waffo_pay_methods.map((method, index) => ({
    type: 'waffo',
    name: method.name,
    icon: method.icon,
    min: Math.max(1, info.waffo_min_topup),
    waffoIndex: index,
  }))
  return [...listed, ...waffo]
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', CNY: '¥', GBP: '£' }

/** A price in its own currency: Creem products and subscription plans are not in the site's display currency. */
export function priceLabel(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()]
  const value = amount.toFixed(2)
  return symbol ? `${symbol}${value}` : `${value} ${currency}`
}

export function presetAmounts(info: WalletInfo): Preset[] {
  const values = info.amount_options.length ? info.amount_options : PRESET_MULTIPLIERS.map((times) => minTopUp(info) * times)
  return values.map((value) => ({ value, discount: info.discount[value] ?? 1 }))
}

/** Percent taken off by a discount rate (0.85 → 15); null at full price. */
export function discountOff(rate: number): number | null {
  if (!(rate > 0 && rate < 1)) return null
  return Math.round((1 - rate) * 100)
}

/**
 * Quota units credited for a top-up amount (controller/topup.go getTopUpQuota):
 * the amount is in USD units unless the site counts in tokens.
 */
export function creditQuota(amount: number, displayType: SiteStatus['quota_display_type'], quotaPerUnit: number): number {
  if (displayType === 'TOKENS') return amount
  return amount * quotaPerUnit
}
