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
import { api } from '@/lib/api'

import { deleteAllKeys, fetchKeys, getAutoGroupConfig, getUserGroups, getUserModels, revealKeys, revealOne } from '../keys-api'

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })
const failed = (message: string) => ({ data: { success: false, message } })

type Config = { params?: unknown }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('key list', () => {
  it('pages through all keys when nothing is searched', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(ok({ items: [{ id: 1 }], total: 1 }))
    expect(await fetchKeys({ page: 2, size: 50, keyword: ' ', token: '' })).toEqual({ items: [{ id: 1 }], total: 1 })
    expect(get).toHaveBeenCalledWith('/api/token/', { params: { p: 2, page_size: 50 } })
  })

  it('searches by name and key with the typed terms', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(ok({ items: null, total: 0 }))
    expect(await fetchKeys({ page: 1, size: 20, keyword: ' prod ', token: '' })).toEqual({ items: [], total: 0 })
    expect(get).toHaveBeenCalledWith('/api/token/search', { params: { keyword: 'prod', p: 1, page_size: 20 } })
    await fetchKeys({ page: 1, size: 20, keyword: '', token: 'sk-abc' })
    expect(get).toHaveBeenLastCalledWith('/api/token/search', { params: { token: 'sk-abc', p: 1, page_size: 20 } })
  })

  it('surfaces the server message when a search fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(failed('使用模糊搜索时，关键词长度至少为 2 个字符'))
    await expect(fetchKeys({ page: 1, size: 20, keyword: '%a', token: '' })).rejects.toThrow('使用模糊搜索时，关键词长度至少为 2 个字符')
  })
})

describe('account groups and models', () => {
  it('lists groups with their description and numeric ratio', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      ok({ auto: { desc: '自动选择', ratio: '自动' }, default: { desc: '默认分组', ratio: 1 }, vip: { ratio: 0.5 } })
    )
    expect(await getUserGroups()).toEqual([
      { name: 'auto', desc: '自动选择', ratio: null },
      { name: 'default', desc: '默认分组', ratio: 1 },
      { name: 'vip', desc: '', ratio: 0.5 },
    ])
  })

  it('reads the global auto order and falls back to five groups at most', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok({ groups: ['vip', 'default'], max_count: 0 }))
    expect(await getAutoGroupConfig()).toEqual({ groups: ['vip', 'default'], max: 5 })
  })

  it('treats a missing model list as empty', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok({}))
    expect(await getUserModels()).toEqual([])
  })
})

describe('revealing one key', () => {
  it('returns the full key with its sk- prefix', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ key: 'full' }))
    expect(await revealOne(5)).toBe('sk-full')
    expect(post).toHaveBeenCalledWith('/api/token/5/key')
  })

  it('surfaces the server message when the key cannot be shown', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(failed('令牌不存在'))
    await expect(revealOne(5)).rejects.toThrow('令牌不存在')
  })

  it('refuses a masked value', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(ok({ key: 'ab****cd' }))
    await expect(revealOne(5)).rejects.toThrow('获取密钥失败')
  })
})

describe('revealing several keys', () => {
  it('returns each full key with its sk- prefix by id', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ keys: { 4: 'four', 9: 'sk-nine' } }))
    expect(await revealKeys([4, 9])).toEqual({ 4: 'sk-four', 9: 'sk-nine' })
    expect(post).toHaveBeenCalledWith('/api/token/batch/keys', { ids: [4, 9] })
  })
})

describe('deleting every key', () => {
  function serve(total: number, options: { keep?: boolean; failDelete?: boolean } = {}) {
    let ids = Array.from({ length: total }, (_, index) => index + 1)
    const deleted: number[][] = []
    vi.spyOn(api, 'get').mockImplementation(async (_url: string, config?: Config) => {
      const params = (config?.params ?? {}) as { p?: number; page_size?: number }
      const page = Number(params.p)
      const size = Number(params.page_size)
      return ok({ items: ids.slice((page - 1) * size, page * size).map((id) => ({ id })), total: ids.length })
    })
    vi.spyOn(api, 'post').mockImplementation(async (_url: string, body?: unknown) => {
      if (options.failDelete) return failed('删除不可用')
      const batch = (body as { ids: number[] }).ids
      deleted.push(batch)
      if (!options.keep) ids = ids.filter((id) => !batch.includes(id))
      return ok(batch.length)
    })
    return deleted
  }

  it('collects keys beyond the first page before deleting them in batches of 100', async () => {
    const deleted = serve(150)
    expect(await deleteAllKeys()).toBe(150)
    expect(deleted.map((batch) => batch.length)).toEqual([100, 50])
    expect(new Set(deleted.flat()).size).toBe(150)
  })

  it('does not report success when the server refuses', async () => {
    serve(3, { failDelete: true })
    await expect(deleteAllKeys()).rejects.toThrow('删除不可用')
  })

  it('reports keys the server still lists afterwards', async () => {
    serve(3, { keep: true })
    await expect(deleteAllKeys()).rejects.toThrow('仍有密钥未删除，请重试')
  })
})
