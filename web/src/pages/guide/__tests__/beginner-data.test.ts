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
import { BEGINNER_TOOLS, filterTools } from '../beginner-catalog'
import { USE_CASES } from '../beginner-help'

const same = (text: string) => text

describe('beginner tool catalog', () => {
  it('gives every tool its own id', () => {
    const ids = BEGINNER_TOOLS.map((tool) => tool.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sends every use case to tools that exist', () => {
    const ids = new Set(BEGINNER_TOOLS.map((tool) => tool.id))
    const broken = USE_CASES.flatMap((row) => row.toolIds.filter((id) => !ids.has(id)))
    expect(broken).toEqual([])
  })
})

describe('filterTools', () => {
  it('puts recommended tools first within a category', () => {
    const coding = filterTools({ category: 'coding', translate: same })
    const firstPlain = coding.findIndex((tool) => !tool.recommended)
    expect(coding.slice(firstPlain).some((tool) => tool.recommended)).toBe(false)
    expect(coding.every((tool) => tool.category === 'coding')).toBe(true)
  })

  it('keeps only the tools of a use case', () => {
    expect(filterTools({ category: 'all', focus: ['cline', 'roo-code'], translate: same }).map((tool) => tool.id).sort()).toEqual(['cline', 'roo-code'])
  })

  it('matches a query against names, summaries and steps', () => {
    expect(filterTools({ category: 'all', query: 'cursor', translate: same }).map((tool) => tool.id)).toEqual(['cursor'])
  })
})
