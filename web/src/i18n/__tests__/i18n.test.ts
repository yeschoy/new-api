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
import { getLang, setLang, t } from '../i18n'

afterEach(() => {
  setLang('zh')
  window.localStorage.clear()
})

describe('i18n', () => {
  it('opens in Chinese', () => {
    expect(getLang()).toBe('zh')
    expect(t('模型')).toBe('模型')
  })

  it('switches to English and remembers the choice', () => {
    setLang('en')
    expect(t('模型')).toBe('Models')
    expect(window.localStorage.getItem('lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('falls back to the Chinese text when a translation is missing', () => {
    setLang('en')
    expect(t('这句没有英文')).toBe('这句没有英文')
  })

  it('tells the same Chinese apart by a |context tag', () => {
    expect(t('模型|表头')).toBe('模型')
    setLang('en')
    expect(t('模型|表头')).toBe('Model')
    expect(t('模型')).toBe('Models')
  })

  it('fills placeholders in either language', () => {
    expect(t('近 {days} 天', { days: 7 })).toBe('近 7 天')
    setLang('en')
    expect(t('近 {days} 天', { days: 7 })).toBe('Last 7 days')
  })
})
