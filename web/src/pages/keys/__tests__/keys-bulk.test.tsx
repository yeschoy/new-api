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
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import type { KeyDetail } from '../keys-api'
import { GROUPS, apiKey, failed, ok, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const PROD = apiKey({ id: 1, name: 'prod' })
const CI = apiKey({ id: 2, name: 'ci', key: 'efgh**********ijkl', status: 2 })

let keys: KeyDetail[] = []

beforeEach(() => {
  signIn()
  keys = [PROD, CI]
  serveGets({ '/api/status': { quota_per_unit: 500_000 }, '/api/user/self/groups': GROUPS }, (url, config) => {
    if (url !== '/api/token/') return undefined
    const params = (config?.params ?? {}) as { p?: number; page_size?: number }
    const page = Number(params.p ?? 1)
    const size = Number(params.page_size ?? 20)
    return ok({ items: keys.slice((page - 1) * size, page * size), total: keys.length })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

function serveBatch(options: { failDelete?: boolean } = {}) {
  return vi.spyOn(api, 'post').mockImplementation(async (url: string, body?: unknown) => {
    const ids = (body as { ids?: number[] } | undefined)?.ids ?? []
    if (url === '/api/token/batch/keys') return ok({ keys: { 1: 'AAA', 2: 'BBB' } })
    if (url === '/api/token/batch') {
      if (options.failDelete) return failed('删除不可用')
      keys = keys.filter((item) => !ids.includes(item.id))
      return ok(ids.length)
    }
    return ok(null)
  })
}

describe('selected keys', () => {
  it('copies the selected keys as name and key lines', async () => {
    const post = serveBatch()
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderKeysPage()
    await user.click(await screen.findByRole('checkbox', { name: '选择 prod' }))
    await user.click(screen.getByRole('checkbox', { name: '选择 ci' }))
    await user.click(screen.getByRole('button', { name: '复制所选' }))
    expect(post).toHaveBeenCalledWith('/api/token/batch/keys', { ids: [1, 2] })
    expect(write).toHaveBeenCalledWith('prod\tsk-AAA\nci\tsk-BBB')
  })

  it('deletes the selected keys after asking', async () => {
    const post = serveBatch()
    const user = userEvent.setup()
    renderKeysPage()
    await user.click(await screen.findByRole('checkbox', { name: '选择 prod' }))
    await user.click(screen.getByRole('button', { name: '删除所选' }))
    expect(screen.getByText('确认删除所选的 1 个密钥？')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(post).toHaveBeenCalledWith('/api/token/batch', { ids: [1] })
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: '选择 prod' })).toBeNull())
    expect(screen.queryByText(/已选/)).toBeNull()
  })

  it('selects every key on the page at once', async () => {
    const user = userEvent.setup()
    renderKeysPage()
    await user.click(await screen.findByRole('checkbox', { name: '全选本页' }))
    expect(screen.getByRole('checkbox', { name: '选择 prod' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 ci' })).toBeChecked()
    expect(screen.getByText('已选 2 个')).toBeInTheDocument()
  })

  it('drops the selection when the status filter changes', async () => {
    const user = userEvent.setup()
    renderKeysPage()
    await user.click(await screen.findByRole('checkbox', { name: '选择 prod' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '状态' }), '已禁用')
    expect(screen.queryByText(/已选/)).toBeNull()
    expect(screen.getByRole('checkbox', { name: '选择 ci' })).not.toBeChecked()
  })
})

describe('deleting every key', () => {
  it('deletes all keys of the account after asking', async () => {
    const post = serveBatch()
    const user = userEvent.setup()
    renderKeysPage()
    await user.click(await screen.findByRole('button', { name: '删除全部密钥' }))
    expect(screen.getByText('确认删除全部 2 个密钥？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/token/batch', { ids: [1, 2] }))
    expect(await screen.findByText('已删除全部密钥')).toBeInTheDocument()
  })

  it('says why deleting every key failed', async () => {
    serveBatch({ failDelete: true })
    const user = userEvent.setup()
    renderKeysPage()
    await user.click(await screen.findByRole('button', { name: '删除全部密钥' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByText('删除不可用')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择 prod' })).toBeInTheDocument()
  })
})
