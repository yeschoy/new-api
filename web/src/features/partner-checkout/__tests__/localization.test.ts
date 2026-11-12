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
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const feature = path.resolve('src/features/partner-checkout')
const sources = [fs.readFileSync(path.join(feature, 'index.tsx'), 'utf8')]
const keys = [...sources.join('\n').matchAll(/\bt\(\s*'([^']+)'/g)].map(
  (match) => match[1]
)

describe('cashier localization', () => {
  it.each(['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi'])(
    'contains every visible cashier key in %s',
    (locale) => {
      const dictionary = JSON.parse(
        fs.readFileSync(path.resolve(`src/i18n/locales/${locale}.json`), 'utf8')
      ).translation
      for (const key of keys) {
        expect(typeof dictionary[key], `${locale}: ${key}`).toBe('string')
        expect(dictionary[key].trim()).not.toBe('')
        if (locale !== 'en' && key.length > 24) {
          expect(dictionary[key], `${locale}: ${key}`).not.toBe(key)
        }
      }
    }
  )
})
