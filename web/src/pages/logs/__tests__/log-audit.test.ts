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
import { setLang } from '@/i18n/i18n'

import { auditContent, changedFieldsText, overrideActionLabel, parseOverrideLine } from '../log-audit'

afterEach(() => {
  setLang('zh')
  window.localStorage.clear()
})

describe('auditContent', () => {
  it('fills the operation template with the recorded params', () => {
    const other = { op: { action: 'user.quota_add', params: { quota: '＄1.00' } } }
    expect(auditContent(other)).toBe('增加用户额度 ＄1.00')
  })

  it('follows the page language', async () => {
    await setLang('en')
    const other = { op: { action: 'channel.delete', params: { name: 'main', id: 4 } } }
    expect(auditContent(other)).toBe('Deleted channel main (ID: 4)')
  })

  it('shows the method and route of operations without their own template', () => {
    expect(auditContent({ op: { action: 'generic', params: { method: 'POST', route: '/api/x' } } })).toBe('POST /api/x')
  })

  it('returns null when the action is unknown or missing', () => {
    expect(auditContent({ op: { action: 'brand.new' } })).toBeNull()
    expect(auditContent(null)).toBeNull()
  })
})

describe('changedFieldsText', () => {
  it('names the channel fields an update changed and keeps unknown ones as recorded', () => {
    const other = { op: { action: 'channel.update', params: { changed_fields: ['status', 'base_url', 'weight'] } } }
    expect(changedFieldsText(other)).toBe('状态, 接口地址, weight')
  })
})

describe('param override lines', () => {
  it('splits the action from its content', () => {
    expect(parseOverrideLine('set model gpt-5')).toEqual({ action: 'set', content: 'model gpt-5' })
    expect(parseOverrideLine('trim_space')).toEqual({ action: 'trim_space', content: 'trim_space' })
  })

  it('labels known actions and keeps unknown ones', () => {
    expect(overrideActionLabel('regex_replace')).toBe('正则替换')
    expect(overrideActionLabel('teleport')).toBe('teleport')
  })
})
