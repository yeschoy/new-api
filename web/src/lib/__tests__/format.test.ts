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
import { localeOf, setLang } from '@/i18n/i18n'

import { bucketLabel, dateTime, shortDate } from '../format'

afterEach(() => {
  setLang('zh')
  window.localStorage.clear()
})

describe('shortDate', () => {
  // Noon UTC falls on the same day in every time zone.
  const noon = Date.UTC(2026, 8, 23, 12) / 1000

  it('writes dates in Chinese by default', () => {
    expect(shortDate(noon)).toBe('2026年9月23日')
  })

  it('writes dates in English after switching', () => {
    setLang('en')
    expect(shortDate(noon)).toBe('Sep 23, 2026')
  })

  it('writes dates in any other language the site speaks', async () => {
    await setLang('ko')
    expect(shortDate(noon)).toBe('2026년 9월 23일')
  })
})

describe('bucketLabel', () => {
  // Day buckets start at midnight UTC; the server labels them in English.
  const day = '2026-09-17T00:00:00Z'

  it('writes day buckets in the active language', () => {
    expect(bucketLabel(day, 'Sep 17')).toBe('9月17日')
    setLang('en')
    expect(bucketLabel(day, 'Sep 17')).toBe('Sep 17')
  })

  it('writes day buckets in any other language the site speaks', async () => {
    await setLang('ko')
    expect(bucketLabel(day, 'Sep 17')).toBe('9월 17일')
  })

  it('keeps hourly labels as the server wrote them', () => {
    expect(bucketLabel('2026-09-17T07:00:00Z', '15:00')).toBe('15:00')
  })
})

describe('dateTime', () => {
  const noon = Date.UTC(2026, 8, 23, 12) / 1000

  it('writes console times in the active language', () => {
    setLang('en')
    expect(dateTime(noon)).toBe(new Date(noon * 1000).toLocaleString(localeOf('en'), { hour12: false }))
    expect(dateTime(noon)).not.toBe(new Date(noon * 1000).toLocaleString('zh-CN', { hour12: false }))
  })
})
