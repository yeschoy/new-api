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
import { tk } from '@/i18n/i18n'

import type { KeyDetail, KeyPayload } from './keys-api'

/** inherit: follow the account's global auto order; custom: the key's own ordered list. */
export type AutoMode = 'inherit' | 'custom'

/** The create / edit form as typed; turned into a request body by formToPayload. */
export type KeyForm = {
  name: string
  unlimited: boolean
  /** Credit in the display currency, as typed. */
  amount: string
  /** Local date and time (YYYY-MM-DDTHH:mm); empty means never. */
  expires: string
  /** '' puts the key in the account's own group. */
  group: string
  autoMode: AutoMode
  autoGroups: string[]
  crossGroupRetry: boolean
  models: string[]
  allowIps: string
  /** How many keys to create at once. */
  count: string
}

/** A message for t(), with its placeholders. */
export type FormError = { text: string; vars?: Record<string, number> }

export const MAX_BATCH = 100
const NAME_LIMIT = 50

export function newKeyForm(autoGroup: boolean): KeyForm {
  return {
    name: '',
    unlimited: true,
    amount: '',
    expires: '',
    group: autoGroup ? 'auto' : '',
    autoMode: 'inherit',
    autoGroups: [],
    crossGroupRetry: autoGroup,
    models: [],
    allowIps: '',
    count: '1',
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A date as the value of a datetime-local input. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Now plus a preset span, for the expiry field; nothing added means never. */
export function expiryAfter(now: Date, span: { months?: number; days?: number; hours?: number }): string {
  if (!span.months && !span.days && !span.hours) return ''
  const date = new Date(now)
  date.setMonth(date.getMonth() + (span.months ?? 0))
  date.setDate(date.getDate() + (span.days ?? 0))
  date.setHours(date.getHours() + (span.hours ?? 0))
  return toLocalInput(date)
}

/** An existing key as the form shows it; auto groups the account can no longer use are dropped. */
export function keyToForm(
  key: KeyDetail,
  options: { available?: string[]; max: number; toAmount: (quota: number) => number }
): KeyForm {
  const stored = key.auto_groups ?? []
  const available = options.available ? new Set(options.available) : null
  const amount = Number(options.toAmount(key.remain_quota).toFixed(6))
  return {
    name: key.name,
    unlimited: key.unlimited_quota,
    amount: key.unlimited_quota ? '' : String(amount),
    expires: key.expired_time > 0 ? toLocalInput(new Date(key.expired_time * 1000)) : '',
    group: key.group ?? '',
    autoMode: stored.length > 0 ? 'custom' : 'inherit',
    autoGroups: stored.filter((group) => !available || available.has(group)).slice(0, Math.max(0, options.max)),
    crossGroupRetry: Boolean(key.cross_group_retry),
    models: (key.model_limits ?? '').split(',').map((model) => model.trim()).filter(Boolean),
    allowIps: key.allow_ips ?? '',
    count: '1',
  }
}

/**
 * The group a key ends up in: a group the account cannot use falls back to
 * "default", or else to the first one it can. Unknown groups (still loading)
 * leave the choice alone.
 */
export function resolveGroup(group: string, available: string[]): string {
  if (!group || available.length === 0 || available.includes(group)) return group
  return available.includes('default') ? 'default' : available[0]
}

export function formToPayload(form: KeyForm, toQuota: (amount: number) => number): KeyPayload {
  const auto = form.group === 'auto'
  return {
    name: form.name.trim(),
    remain_quota: form.unlimited ? 0 : toQuota(Number(form.amount)),
    expired_time: form.expires ? Math.floor(new Date(form.expires).getTime() / 1000) : -1,
    unlimited_quota: form.unlimited,
    model_limits_enabled: form.models.length > 0,
    model_limits: form.models.join(','),
    allow_ips: form.allowIps.trim(),
    group: form.group,
    auto_groups: auto && form.autoMode === 'custom' ? form.autoGroups : [],
    cross_group_retry: auto ? form.crossGroupRetry : false,
  }
}

function amountError(form: KeyForm, creating: boolean, toQuota: (amount: number) => number): FormError | null {
  if (form.unlimited) return null
  const amount = Number(form.amount)
  const typed = form.amount.trim() !== '' && Number.isFinite(amount)
  if (creating) return typed && toQuota(amount) > 0 ? null : { text: tk('请输入大于 0 的额度上限') }
  return typed && amount >= 0 ? null : { text: tk('请输入有效的剩余额度') }
}

function autoError(form: KeyForm, maxAutoGroups: number): FormError | null {
  if (form.group !== 'auto' || form.autoMode !== 'custom') return null
  if (form.autoGroups.length === 0) return { text: tk('请至少选择一个自动分组，或恢复全局顺序') }
  if (form.autoGroups.length > maxAutoGroups) return { text: tk('最多选择 {max} 个自动分组'), vars: { max: maxAutoGroups } }
  return null
}

/** The first problem with the form, or null when it can be sent. */
export function validateKeyForm(
  form: KeyForm,
  options: { creating: boolean; maxAutoGroups: number; toQuota: (amount: number) => number }
): FormError | null {
  if (!form.name.trim()) return { text: tk('请输入密钥名称') }
  const amount = amountError(form, options.creating, options.toQuota)
  if (amount) return amount
  const auto = autoError(form, options.maxAutoGroups)
  if (auto) return auto
  if (!options.creating) return null
  const count = Number(form.count)
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) return { text: tk('数量需为 1 到 100 之间的整数') }
  return null
}

/** Names for keys created together: the first as typed, the rest with a random suffix, all within the server's limit. */
export function batchNames(name: string, count: number): string[] {
  const base = name.slice(0, NAME_LIMIT - 7)
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return name
    return `${base}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`
  })
}
