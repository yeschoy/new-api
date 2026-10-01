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
import { EN } from '../en'
import { LANGUAGES } from '../i18n'

// Every app source file except tests and the i18n module itself.
const sources = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/__tests__/**', '!../**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Every language's table by id: English ships with the page, the others live in ../locales.
const locales = import.meta.glob<Record<string, string>>('../locales/*.ts', { import: 'default', eager: true })
const TABLES: Record<string, Record<string, string>> = { en: EN }
for (const [path, table] of Object.entries(locales)) TABLES[path.replace(/^.*\/|\.ts$/g, '')] = table

// t('…') translates where it is shown; tk('…') marks text stored for later.
const CALL = /\btk?\(\s*'((?:[^'\\]|\\.)*)'/g
const CHINESE = /[一-鿿]/

// Keeps the line breaks of block comments so reported line numbers match the file.
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

describe('translations', () => {
  it('finds the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(40)
  })

  it('has a table for every language but Chinese, the source', () => {
    const wanted = LANGUAGES.map((item) => item.id).filter((id) => id !== 'zh')
    expect(Object.keys(TABLES).sort()).toEqual([...wanted].sort())
  })

  it('has every text passed to t() or tk() in every language', () => {
    const missing = new Set<string>()
    for (const code of Object.values(sources)) {
      for (const match of code.matchAll(CALL)) {
        const text = match[1].replace(/\\'/g, "'")
        for (const [lang, table] of Object.entries(TABLES)) if (!(text in table)) missing.add(`${lang}: ${text}`)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('keeps the {placeholders} of every text', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(' ')
    const broken: string[] = []
    for (const [lang, table] of Object.entries(TABLES)) {
      for (const [text, value] of Object.entries(table)) {
        if (placeholders(text) !== placeholders(value)) broken.push(`${lang}: ${text} → ${value}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('leaves no Chinese UI text outside t() or tk()', () => {
    const stray: string[] = []
    for (const [file, code] of Object.entries(sources)) {
      withoutComments(code)
        .replace(CALL, 't(')
        .split('\n')
        .forEach((line, i) => {
          if (CHINESE.test(line)) stray.push(`${file.replace('../../', 'src/')}:${i + 1} ${line.trim()}`)
        })
    }
    expect(stray).toEqual([])
  })
})
