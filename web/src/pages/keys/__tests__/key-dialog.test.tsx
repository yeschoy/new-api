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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { GROUPS, apiKey, failed, ok, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const EXPIRES = Math.floor(new Date(2027, 0, 1, 12, 0).getTime() / 1000)

const STORED = apiKey({
  id: 1,
  name: 'prod',
  group: 'vip',
  remain_quota: 1_000_000,
  unlimited_quota: false,
  expired_time: EXPIRES,
  model_limits_enabled: true,
  model_limits: 'gpt-b',
  allow_ips: '1.2.3.4',
})

const DATA = {
  '/api/status': { quota_per_unit: 500_000 },
  '/api/token/': { items: [STORED], total: 1 },
  '/api/user/self/groups': GROUPS,
  '/api/token/auto-groups': { groups: ['vip', 'default'], max_count: 3 },
  '/api/user/models': ['gpt-a', 'gpt-b'],
  '/api/token/1': STORED,
}

type Body = Record<string, unknown>

let created: Body[] = []

function serveCreates(options: { failAfter?: number } = {}) {
  created = []
  return vi.spyOn(api, 'post').mockImplementation(async (url: string, body?: unknown) => {
    if (url !== '/api/token/') return ok({ key: 'NEWKEY' })
    if (options.failAfter !== undefined && created.length >= options.failAfter) return failed('已达到最大令牌数量限制 (1000)')
    created.push(body as Body)
    return ok({ id: 100 + created.length, name: (body as Body).name })
  })
}

beforeEach(() => {
  signIn()
  serveGets(DATA)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  renderKeysPage()
  await user.click(await screen.findByRole('button', { name: /创建密钥/ }))
  const dialog = await screen.findByRole('dialog', { name: '创建 API 密钥' })
  await user.type(within(dialog).getByPlaceholderText('例如：生产环境'), 'batch')
  return dialog
}

describe('creating keys', () => {
  it('sends the group, expiry, models and IPs chosen', async () => {
    serveCreates()
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '分组' }), 'vip')
    await user.click(within(dialog).getByRole('button', { name: '1 天' }))
    await user.click(within(dialog).getByRole('button', { name: '高级设置' }))
    await user.click(await within(dialog).findByRole('checkbox', { name: 'gpt-a' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'IP 白名单' }), '10.0.0.1')
    const before = Math.floor(Date.now() / 1000)
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(await screen.findByText('sk-NEWKEY')).toBeInTheDocument()
    expect(created[0]).toMatchObject({
      name: 'batch',
      group: 'vip',
      unlimited_quota: true,
      model_limits_enabled: true,
      model_limits: 'gpt-a',
      allow_ips: '10.0.0.1',
      auto_groups: [],
      cross_group_retry: false,
    })
    expect(Number(created[0].expired_time)).toBeGreaterThan(before + 86_400 - 120)
    expect(Number(created[0].expired_time)).toBeLessThan(before + 86_400 + 120)
  })

  it('creates several keys at once with suffixed names', async () => {
    serveCreates()
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    const count = within(dialog).getByRole('textbox', { name: '数量' })
    await user.clear(count)
    await user.type(count, '3')
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(await screen.findByText('已创建 3 个密钥。')).toBeInTheDocument()
    expect(created.map((body) => body.name)).toEqual(['batch', expect.stringMatching(/^batch-[a-z0-9]{6}$/), expect.stringMatching(/^batch-[a-z0-9]{6}$/)])
  })

  it('stops at the first refusal and says how many keys were made', async () => {
    serveCreates({ failAfter: 1 })
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    const count = within(dialog).getByRole('textbox', { name: '数量' })
    await user.clear(count)
    await user.type(count, '3')
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(await screen.findByText('已创建 1 个密钥。')).toBeInTheDocument()
    expect(screen.getByText('已达到最大令牌数量限制 (1000)')).toBeInTheDocument()
    expect(created).toHaveLength(1)
  })

  it('checks the form before sending', async () => {
    const post = serveCreates()
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    const count = within(dialog).getByRole('textbox', { name: '数量' })
    await user.clear(count)
    await user.type(count, '0')
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(within(dialog).getByText('数量需为 1 到 100 之间的整数')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('editing a key', () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    renderKeysPage()
    const row = await screen.findByRole('row', { name: /abcd/ })
    await user.click(within(row).getByRole('button', { name: '编辑' }))
    return screen.findByRole('dialog', { name: '编辑密钥' })
  }

  it('shows the stored settings', async () => {
    const user = userEvent.setup()
    const dialog = await openEdit(user)
    expect(await within(dialog).findByDisplayValue('prod')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: '分组' })).toHaveValue('vip')
    expect(within(dialog).getByPlaceholderText('10')).toHaveValue('2')
    expect(within(dialog).getByRole('checkbox', { name: 'gpt-b' })).toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: 'IP 白名单' })).toHaveValue('1.2.3.4')
    expect(within(dialog).queryByRole('textbox', { name: '数量' })).toBeNull()
  })

  it('saves every field of the key', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(STORED))
    const user = userEvent.setup()
    const dialog = await openEdit(user)
    const name = await within(dialog).findByDisplayValue('prod')
    await user.clear(name)
    await user.type(name, 'prod-2')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/token/', {
        id: 1,
        name: 'prod-2',
        remain_quota: 1_000_000,
        unlimited_quota: false,
        expired_time: EXPIRES,
        model_limits_enabled: true,
        model_limits: 'gpt-b',
        allow_ips: '1.2.3.4',
        group: 'vip',
        auto_groups: [],
        cross_group_retry: false,
      })
    )
    expect(await screen.findByText('密钥已更新')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows why the key could not be opened', async () => {
    serveGets(DATA, (url) => (url === '/api/token/1' ? failed('令牌不存在') : undefined))
    const user = userEvent.setup()
    const dialog = await openEdit(user)
    expect(await within(dialog).findByText('令牌不存在')).toBeInTheDocument()
  })
})
