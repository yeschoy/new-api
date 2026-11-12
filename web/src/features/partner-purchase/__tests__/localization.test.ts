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
import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  'src/features/partner-purchase/index.tsx',
  'utf8'
)
const keys = [
  ...new Set(
    [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((match) => match[1])
  ),
]
const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort()
describe('hosted purchase copy in all seven locales', () => {
  it.each(['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi'])(
    'translates all UI/error keys and preserves placeholders in %s',
    (locale) => {
      const dictionary = JSON.parse(
        fs.readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
      ).translation
      expect(keys.length).toBeGreaterThan(25)
      for (const key of keys) {
        expect(typeof dictionary[key], `${locale}: ${key}`).toBe('string')
        expect(dictionary[key]?.trim(), `${locale}: ${key}`).not.toBe('')
        expect(placeholders(dictionary[key]), `${locale}: ${key}`).toEqual(
          placeholders(key)
        )
        if (locale !== 'en' && key.length > 24) {
          expect(dictionary[key], `${locale}: ${key}`).not.toBe(key)
        }
      }
    }
  )
})
