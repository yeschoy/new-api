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

import { GUIDE_TOOLS } from '../../constants'
import { filterErrorRows, filterGuideTools } from '../filters'

describe('guide list filters', () => {
  test('keeps only coding tools when the code use case is selected', () => {
    const tools = filterGuideTools(GUIDE_TOOLS, 'code', '')

    expect(tools.length).toBeGreaterThan(0)
    expect(tools.every((tool) => tool.useCases.includes('code'))).toBe(true)
    expect(tools.some((tool) => tool.id === 'cherry-studio')).toBe(false)
    expect(tools.some((tool) => tool.id === 'trae')).toBe(true)
  })

  test('includes Trae when searching by name', () => {
    const tools = filterGuideTools(GUIDE_TOOLS, 'all', 'trae')

    expect(tools).toHaveLength(1)
    expect(tools[0]?.id).toBe('trae')
    expect(tools[0]?.beginnerPick).toBe(true)
  })

  test('filters tools by name regardless of use case when browsing all', () => {
    const tools = filterGuideTools(GUIDE_TOOLS, 'all', 'cherry')

    expect(tools).toHaveLength(1)
    expect(tools[0]?.id).toBe('cherry-studio')
  })

  test('returns an empty tool list when no app name matches', () => {
    expect(filterGuideTools(GUIDE_TOOLS, 'all', 'not-a-real-app')).toEqual([])
  })

  test('filters error rows by status code text', () => {
    const rows = filterErrorRows('404')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('404')
  })

  test('returns every error row when the query is empty', () => {
    expect(filterErrorRows('').length).toBeGreaterThan(1)
  })

  test('returns no error rows when nothing matches', () => {
    expect(filterErrorRows('no-such-error')).toEqual([])
  })
})
