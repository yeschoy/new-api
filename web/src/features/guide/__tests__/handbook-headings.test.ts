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
import { describe, expect, it } from 'vitest'

import { parseHandbookHeadings } from '../lib/handbook'

describe('parseHandbookHeadings', () => {
  it('skips the document title and keeps H1 and H2 outline entries in order', () => {
    const headings = parseHandbookHeadings(
      [
        '# Title',
        'intro',
        '## Quick version',
        '# 一、Chat apps',
        '## 1\\. Cherry Studio',
        '### ignored h3',
      ].join('\n')
    )

    expect(headings).toEqual([
      { id: 'hb-1', level: 2, text: 'Quick version' },
      { id: 'hb-2', level: 1, text: '一、Chat apps' },
      { id: 'hb-3', level: 2, text: '1. Cherry Studio' },
    ])
  })

  it('ignores heading-like lines inside fenced code blocks', () => {
    const headings = parseHandbookHeadings(
      ['# Title', '```bash', '# not a heading', '```', '## Real'].join('\n')
    )

    expect(headings.map((heading) => heading.text)).toEqual(['Real'])
  })
})
