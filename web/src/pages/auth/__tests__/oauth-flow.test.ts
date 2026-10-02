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
import { callbackMode, handoffTarget, markBindPopup } from '../oauth-flow'

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('handoffTarget', () => {
  it('sends a successful custom-domain binding to that domain with its ticket in the hash', () => {
    const target = handoffTarget({ action: 'domain_bind_handoff', target_origin: 'https://custom.example.com', provider: 'github', ticket: 'tk' }, true)
    expect(target).toBe('https://custom.example.com/oauth/handoff?mode=bind&provider=github#ticket=tk')
  })

  it('returns a failed custom-domain binding with its result', () => {
    const target = handoffTarget({ action: 'domain_bind_return', target_origin: 'https://custom.example.com', provider: 'github', result: 'cancelled' }, false)
    expect(target).toBe('https://custom.example.com/oauth/handoff?mode=bind-return&provider=github#result=cancelled')
  })

  it('sends a failed custom-domain sign-in back to that domain’s sign-in page', () => {
    expect(handoffTarget({ action: 'domain_oauth_return', target_origin: 'https://custom.example.com' }, false)).toBe('https://custom.example.com/sign-in')
  })

  it('ignores targets that are not plain https origins', () => {
    expect(handoffTarget({ action: 'domain_login_handoff', target_origin: 'http://custom.example.com', ticket: 'tk' }, true)).toBeNull()
    expect(handoffTarget({ action: 'domain_login_handoff', target_origin: 'https://custom.example.com/path', ticket: 'tk' }, true)).toBeNull()
    expect(handoffTarget({ action: 'domain_login_handoff', target_origin: 'https://custom.example.com', ticket: 'tk' }, false)).toBeNull()
  })
})

describe('callbackMode', () => {
  it('treats a callback as a binding only in the popup stamped for that provider and state', () => {
    const storage = memoryStorage()
    const opener = { closed: false }
    expect(markBindPopup(storage, 'github', 'state-1')).toBe(true)

    expect(callbackMode('github', 'state-1', { opener, storage })).toBe('bind')
    expect(callbackMode('github', 'state-2', { opener, storage })).toBe('login')
    expect(callbackMode('github', 'state-1', { opener: null, storage })).toBe('login')
    expect(callbackMode('github', 'state-1', { opener: { closed: true }, storage })).toBe('login')
  })
})
