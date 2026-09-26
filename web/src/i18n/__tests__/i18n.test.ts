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
import { detectLang, getLang, setLang, t } from '../i18n'

const TABLES = import.meta.glob<Record<string, string>>('../locales/*.ts', { import: 'default', eager: true })
const table = (lang: string) => TABLES[`../locales/${lang}.ts`]

function setBrowser(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true })
}

/** A fresh copy of the module, as on a new page load. */
async function openPage() {
  vi.resetModules()
  const fresh = await import('../i18n')
  await fresh.i18nReady
  return fresh
}

afterEach(() => {
  setLang('zh')
  window.localStorage.clear()
  setBrowser(['zh-CN'])
})

describe('i18n', () => {
  it('opens in Chinese for a Chinese browser', () => {
    expect(getLang()).toBe('zh')
    expect(t('模型')).toBe('模型')
  })

  it('switches to English and remembers the choice', () => {
    setLang('en')
    expect(t('模型')).toBe('Models')
    expect(window.localStorage.getItem('lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en-US')
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

describe('the first language', () => {
  it.each([
    [['zh-CN'], 'zh'],
    [['zh-Hans-HK'], 'zh'],
    [['zh-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-Hant'], 'zh-TW'],
    [['ja-JP'], 'ja'],
    [['pt-BR'], 'pt'],
    [['nl-NL', 'de-DE'], 'de'],
    [['nl-NL'], 'en'],
    [[], 'en'],
  ])('is picked from the browser list %j as %s', (browser, lang) => {
    expect(detectLang(browser)).toBe(lang)
  })

  it('follows the browser when nothing was chosen', async () => {
    setBrowser(['ko-KR', 'en-US'])
    const page = await openPage()
    expect(page.getLang()).toBe('ko')
    expect(page.t('模型')).toBe(table('ko')['模型'])
    expect(document.documentElement.lang).toBe('ko-KR')
  })

  it("is the visitor's own choice when there is one", async () => {
    setBrowser(['ko-KR'])
    window.localStorage.setItem('lang', 'ja')
    const page = await openPage()
    expect(page.getLang()).toBe('ja')
    expect(page.t('模型')).toBe(table('ja')['模型'])
  })

  it('ignores an earlier choice that is still loading', async () => {
    const page = await openPage()
    const slow = page.setLang('ja')
    void page.setLang('en')
    await slow
    expect(page.getLang()).toBe('en')
  })
})
