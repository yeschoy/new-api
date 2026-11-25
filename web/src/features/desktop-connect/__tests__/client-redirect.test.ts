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
import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { Route as ClientRoute } from '@/routes/client'
import { Route as DownloadRoute } from '@/routes/download'

function redirectTarget(beforeLoad: unknown): string | undefined {
  try {
    ;(beforeLoad as () => void)()
  } catch (error) {
    if (isRedirect(error)) return error.options.href
    throw error
  }
  return undefined
}

describe('client release page routes', () => {
  it.each([
    ['/client', ClientRoute],
    ['/download', DownloadRoute],
  ])('%s sends visitors to yeschoy.app', (_path, route) => {
    expect(redirectTarget(route.options.beforeLoad)).toBe(
      'https://yeschoy.app/'
    )
  })
})
