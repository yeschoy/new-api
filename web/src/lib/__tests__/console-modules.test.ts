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
import { consoleModuleOn } from '../console-modules'

// The live site's SidebarModulesAdmin on 2026-10-01.
const LIVE = JSON.stringify({
  chat: { enabled: true, playground: true, chat: false },
  console: { enabled: true, detail: true, token: true, log: true, midjourney: false, task: false, audit: true },
  personal: { enabled: true, topup: true, personal: true, security: true },
  admin: { enabled: true, channel: true, models: true, redemption: true, user: true, setting: true, subscription: true },
})

describe('consoleModuleOn', () => {
  it('follows the admin switches', () => {
    expect(consoleModuleOn(LIVE, undefined, 'console', 'token')).toBe(true)
    expect(consoleModuleOn(LIVE, undefined, 'console', 'task')).toBe(false)
    expect(consoleModuleOn(LIVE, undefined, 'console', 'midjourney')).toBe(false)
    expect(consoleModuleOn(LIVE, undefined, 'admin', 'channel')).toBe(true)
  })

  it('turns a whole section off with its enabled switch', () => {
    const raw = JSON.stringify({ admin: { enabled: false, channel: true } })
    expect(consoleModuleOn(raw, undefined, 'admin', 'channel')).toBe(false)
  })

  it('falls back to the defaults for missing sections and modules, as the old console did', () => {
    const raw = JSON.stringify({ console: { enabled: true, token: true } })
    expect(consoleModuleOn(raw, undefined, 'console', 'log')).toBe(true)
    expect(consoleModuleOn(raw, undefined, 'admin', 'user')).toBe(true)
    expect(consoleModuleOn(undefined, undefined, 'personal', 'topup')).toBe(true)
    expect(consoleModuleOn('{broken', undefined, 'console', 'detail')).toBe(true)
  })

  it('lets a user hide more, never show what the admin hid', () => {
    const user = JSON.stringify({ console: { enabled: true, log: false }, chat: { enabled: false } })
    expect(consoleModuleOn(LIVE, user, 'console', 'log')).toBe(false)
    expect(consoleModuleOn(LIVE, user, 'chat', 'playground')).toBe(false)
    expect(consoleModuleOn(LIVE, user, 'console', 'token')).toBe(true)
    expect(consoleModuleOn(LIVE, JSON.stringify({ console: { task: true } }), 'console', 'task')).toBe(false)
  })
})
