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
import { describe, expect, test } from 'vitest'

import { isAdminWorkspacePath } from '../beginner-shell'

describe('isAdminWorkspacePath', () => {
  test('keeps everyday using pages out of the admin workspace', () => {
    expect(isAdminWorkspacePath('/dashboard/overview')).toBe(false)
    expect(isAdminWorkspacePath('/keys')).toBe(false)
    expect(isAdminWorkspacePath('/wallet')).toBe(false)
    expect(isAdminWorkspacePath('/usage-logs/common')).toBe(false)
    expect(isAdminWorkspacePath('/profile')).toBe(false)
  })

  test('treats operator tools as the admin workspace', () => {
    expect(isAdminWorkspacePath('/channels')).toBe(true)
    expect(isAdminWorkspacePath('/system-settings/site')).toBe(true)
    expect(isAdminWorkspacePath('/dashboard/models')).toBe(true)
    expect(isAdminWorkspacePath('/usage-logs/task')).toBe(true)
  })
})
