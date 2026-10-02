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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  DESKTOP_NOTICES_EXAMPLE,
  validateDesktopNotices,
} from '../maintenance/desktop-notices'

describe('desktop notices validation', () => {
  test('accepts an empty value, an empty array, and the documented example', () => {
    for (const value of ['', '   ', '[]', DESKTOP_NOTICES_EXAMPLE]) {
      assert.equal(validateDesktopNotices(value), null, value)
    }
  })

  test('rejects malformed JSON and non-array values', () => {
    assert.deepEqual(validateDesktopNotices('[{'), { kind: 'invalid-json' })
    assert.deepEqual(validateDesktopNotices('{"title":"x"}'), {
      kind: 'not-array',
    })
  })

  test('reports the position of entries without a usable title', () => {
    assert.deepEqual(validateDesktopNotices('[{"title":"ok"},"x"]'), {
      kind: 'not-object',
      position: 2,
    })
    assert.deepEqual(validateDesktopNotices('[{"id":"a","title":"  "}]'), {
      kind: 'missing-title',
      position: 1,
    })
  })

  test('rejects a repeated id but allows entries without ids', () => {
    assert.deepEqual(
      validateDesktopNotices(
        '[{"id":"a","title":"x"},{"title":"y"},{"id":"a","title":"z"}]'
      ),
      { kind: 'duplicate-id', position: 3, id: 'a' }
    )
    assert.equal(validateDesktopNotices('[{"title":"x"},{"title":"y"}]'), null)
  })
})
