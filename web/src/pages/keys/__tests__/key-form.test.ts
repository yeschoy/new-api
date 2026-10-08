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
import type { KeyDetail } from '../keys-api'
import {
  batchNames,
  expiryAfter,
  formToPayload,
  keyToForm,
  newKeyForm,
  resolveGroup,
  validateKeyForm,
  type KeyForm,
} from '../key-form'

// $1 = 500,000 quota units, the backend default.
const toQuota = (amount: number) => Math.round(amount * 500_000)
const toAmount = (quota: number) => quota / 500_000

function form(patch: Partial<KeyForm> = {}): KeyForm {
  return { ...newKeyForm(false), name: 'ci', ...patch }
}

const KEY: KeyDetail = {
  id: 3,
  name: 'prod',
  key: 'abcd**********wxyz',
  status: 1,
  created_time: 1_760_000_000,
  accessed_time: 1_760_000_000,
  expired_time: -1,
  remain_quota: 1_000_000,
  unlimited_quota: false,
  used_quota: 0,
  group: 'auto',
  model_limits_enabled: true,
  model_limits: 'gpt-a,gpt-b',
  allow_ips: '10.0.0.1\n10.0.1.0/24',
  cross_group_retry: true,
  auto_groups: ['vip', 'gone', 'default'],
}

describe('new key form', () => {
  it('starts in the auto group with cross-group retry when the site defaults to auto', () => {
    const value = newKeyForm(true)
    expect(value.group).toBe('auto')
    expect(value.crossGroupRetry).toBe(true)
    expect(value.unlimited).toBe(true)
    expect(value.count).toBe('1')
  })

  it('starts in the account default group otherwise', () => {
    expect(newKeyForm(false).group).toBe('')
  })
})

describe('request body', () => {
  it('sends a never-expiring unlimited key without limits', () => {
    expect(formToPayload(form(), toQuota)).toEqual({
      name: 'ci',
      remain_quota: 0,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      group: '',
      auto_groups: [],
      cross_group_retry: false,
    })
  })

  it('turns the typed limit, models, IPs and expiry into the request body', () => {
    const body = formToPayload(
      form({ unlimited: false, amount: '2', models: ['gpt-a', 'gpt-b'], allowIps: ' 10.0.0.1\n10.0.1.0/24 ', expires: '2026-12-01T08:30' }),
      toQuota
    )
    expect(body.remain_quota).toBe(1_000_000)
    expect(body.model_limits_enabled).toBe(true)
    expect(body.model_limits).toBe('gpt-a,gpt-b')
    expect(body.allow_ips).toBe('10.0.0.1\n10.0.1.0/24')
    expect(body.expired_time).toBe(Math.floor(new Date(2026, 11, 1, 8, 30).getTime() / 1000))
  })

  it('sends the custom order only for auto keys that chose one', () => {
    expect(formToPayload(form({ group: 'auto', autoMode: 'custom', autoGroups: ['vip'] }), toQuota).auto_groups).toEqual(['vip'])
    expect(formToPayload(form({ group: 'auto', autoMode: 'inherit', autoGroups: ['vip'] }), toQuota).auto_groups).toEqual([])
    const plain = formToPayload(form({ group: 'vip', autoMode: 'custom', autoGroups: ['vip'], crossGroupRetry: true }), toQuota)
    expect(plain.auto_groups).toEqual([])
    expect(plain.cross_group_retry).toBe(false)
  })
})

describe('editing an existing key', () => {
  it('reads the key back into the form and drops auto groups the account cannot use', () => {
    const value = keyToForm(KEY, { available: ['vip', 'default'], max: 5, toAmount })
    expect(value).toMatchObject({
      name: 'prod',
      unlimited: false,
      amount: '2',
      expires: '',
      group: 'auto',
      autoMode: 'custom',
      autoGroups: ['vip', 'default'],
      crossGroupRetry: true,
      models: ['gpt-a', 'gpt-b'],
      allowIps: '10.0.0.1\n10.0.1.0/24',
    })
  })

  it('treats a key without a stored order as following the global order', () => {
    expect(keyToForm({ ...KEY, auto_groups: null }, { available: ['vip'], max: 5, toAmount }).autoMode).toBe('inherit')
  })

  it('shows the expiry as a local date and time', () => {
    const expires = Math.floor(new Date(2026, 11, 1, 8, 30).getTime() / 1000)
    expect(keyToForm({ ...KEY, expired_time: expires }, { max: 5, toAmount }).expires).toBe('2026-12-01T08:30')
  })
})

describe('group the key will use', () => {
  const groups = ['auto', 'default', 'vip']

  it('keeps a group the account can use', () => {
    expect(resolveGroup('vip', groups)).toBe('vip')
    expect(resolveGroup('', groups)).toBe('')
  })

  it('falls back to the default group when the chosen one is not available', () => {
    expect(resolveGroup('gone', groups)).toBe('default')
    expect(resolveGroup('gone', ['vip'])).toBe('vip')
  })

  it('keeps the chosen group while the account groups are unknown', () => {
    expect(resolveGroup('auto', [])).toBe('auto')
  })
})

describe('form checks', () => {
  const check = (value: KeyForm, creating = true) => validateKeyForm(value, { creating, maxAutoGroups: 2, toQuota })

  it('asks for a name', () => {
    expect(check(form({ name: '  ' }))?.text).toBe('请输入密钥名称')
  })

  it('asks for a limit above zero when creating a limited key', () => {
    expect(check(form({ unlimited: false, amount: '0' }))?.text).toBe('请输入大于 0 的额度上限')
    expect(check(form({ unlimited: false, amount: 'abc' }))?.text).toBe('请输入大于 0 的额度上限')
  })

  it('lets an edited key keep zero credit left', () => {
    expect(check(form({ unlimited: false, amount: '0' }), false)).toBeNull()
    expect(check(form({ unlimited: false, amount: '-1' }), false)?.text).toBe('请输入有效的剩余额度')
  })

  it('asks for at least one group in a custom auto order', () => {
    expect(check(form({ group: 'auto', autoMode: 'custom', autoGroups: [] }))?.text).toBe('请至少选择一个自动分组，或恢复全局顺序')
  })

  it('caps the custom auto order at the server limit', () => {
    const result = check(form({ group: 'auto', autoMode: 'custom', autoGroups: ['a', 'b', 'c'] }))
    expect(result).toEqual({ text: '最多选择 {max} 个自动分组', vars: { max: 2 } })
  })

  it('accepts 1 to 100 keys at a time', () => {
    expect(check(form({ count: '0' }))?.text).toBe('数量需为 1 到 100 之间的整数')
    expect(check(form({ count: '101' }))?.text).toBe('数量需为 1 到 100 之间的整数')
    expect(check(form({ count: '2.5' }))?.text).toBe('数量需为 1 到 100 之间的整数')
    expect(check(form({ count: '100' }))).toBeNull()
  })

  it('ignores the count when editing', () => {
    expect(check(form({ count: '0' }), false)).toBeNull()
  })
})

describe('expiry presets', () => {
  const now = new Date(2026, 0, 15, 23, 30)

  it('adds the preset to now', () => {
    expect(expiryAfter(now, { hours: 1 })).toBe('2026-01-16T00:30')
    expect(expiryAfter(now, { days: 1 })).toBe('2026-01-16T23:30')
    expect(expiryAfter(now, { months: 1 })).toBe('2026-02-15T23:30')
  })

  it('means never when nothing is added', () => {
    expect(expiryAfter(now, {})).toBe('')
  })
})

describe('names for several keys', () => {
  it('keeps the first name and gives the rest a random suffix', () => {
    const names = batchNames('batch', 3)
    expect(names).toHaveLength(3)
    expect(names[0]).toBe('batch')
    expect(names[1]).toMatch(/^batch-[a-z0-9]{6}$/)
    expect(new Set(names).size).toBe(3)
  })

  it('stays within the 50 characters the server allows', () => {
    const names = batchNames('x'.repeat(50), 2)
    expect(names[1].length).toBeLessThanOrEqual(50)
  })
})
