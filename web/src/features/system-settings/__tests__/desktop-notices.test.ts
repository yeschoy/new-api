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
  createEmptyDesktopNotice,
  parseDesktopNotices,
  serializeDesktopNotices,
  validateDesktopNotices,
} from '../maintenance/desktop-notices'

describe('desktop notices validation', () => {
  test('accepts empty config and a well-formed array', () => {
    for (const value of ['', '[]', '[{"title":"ok"}]']) {
      assert.equal(validateDesktopNotices(value), null, value)
    }
  })

  test('rejects invalid JSON and non-arrays', () => {
    assert.deepEqual(validateDesktopNotices('[{'), { kind: 'invalid-json' })
    assert.deepEqual(validateDesktopNotices('{"title":"x"}'), {
      kind: 'not-array',
    })
  })

  test('rejects non-object items and missing titles', () => {
    assert.deepEqual(validateDesktopNotices('[{"title":"ok"},"x"]'), {
      kind: 'not-object',
      position: 2,
    })
    assert.deepEqual(validateDesktopNotices('[{"id":"a","title":"  "}]'), {
      kind: 'missing-title',
      position: 1,
    })
  })

  test('rejects duplicate ids', () => {
    assert.deepEqual(
      validateDesktopNotices(
        '[{"id":"same","title":"a"},{"id":"same","title":"b"}]'
      ),
      { kind: 'duplicate-id', position: 2, id: 'same' }
    )
    assert.equal(validateDesktopNotices('[{"title":"x"},{"title":"y"}]'), null)
  })
})

describe('desktop notices parse/serialize', () => {
  test('round-trips a typical notice', () => {
    const raw = serializeDesktopNotices([
      {
        id: 'a',
        title: 'Hello',
        body: 'Line1\nLine2',
        severity: 'info',
        publishedAtEpochMs: 1000,
        expiresAtEpochMs: 0,
        banner: true,
        action: { kind: 'wallet', label: 'Top up' },
      },
    ])
    const parsed = parseDesktopNotices(raw)
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0]?.title, 'Hello')
    assert.equal(parsed[0]?.action?.kind, 'wallet')
    assert.equal(createEmptyDesktopNotice().severity, 'info')
  })
})
