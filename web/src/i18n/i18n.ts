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
import { useSyncExternalStore } from 'react'

import { EN } from './en'

export type Lang = 'zh' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'es' | 'pt' | 'fr' | 'de' | 'ru' | 'vi' | 'id'

type Table = Record<string, string>

/** Languages in the switcher, each named in its own language, with the locale for <html lang> and dates. */
export const LANGUAGES: readonly { id: Lang; label: string; locale: string }[] = [
  { id: 'zh', label: '简体中文', locale: 'zh-CN' },
  { id: 'zh-TW', label: '繁體中文', locale: 'zh-TW' },
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'ja', label: '日本語', locale: 'ja-JP' },
  { id: 'ko', label: '한국어', locale: 'ko-KR' },
  { id: 'es', label: 'Español', locale: 'es-ES' },
  { id: 'pt', label: 'Português', locale: 'pt-BR' },
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE' },
  { id: 'ru', label: 'Русский', locale: 'ru-RU' },
  { id: 'vi', label: 'Tiếng Việt', locale: 'vi-VN' },
  { id: 'id', label: 'Bahasa Indonesia', locale: 'id-ID' },
]

const STORAGE_KEY = 'lang'

// Chinese is the source text and English ships with the page; the other tables load when first needed.
const tables: Partial<Record<Lang, Table>> = { en: EN }
const loaders = import.meta.glob<Table>('./locales/*.ts', { import: 'default' })

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((item) => item.id === value)
}

export function localeOf(lang: Lang): string {
  return LANGUAGES.find((item) => item.id === lang)?.locale ?? 'en-US'
}

/** The first of the visitor's browser languages the site speaks; English when there is none. */
export function detectLang(browser: readonly string[]): Lang {
  for (const tag of browser) {
    const lower = tag.toLowerCase()
    if (lower === 'zh' || lower.startsWith('zh-')) {
      return !lower.includes('hans') && /hant|-tw|-hk|-mo/.test(lower) ? 'zh-TW' : 'zh'
    }
    const base = lower.split('-')[0]
    if (isLang(base)) return base
  }
  return 'en'
}

/** The visitor's own choice from the menu, or else their browser's language. */
function initialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // Storage may be unavailable; go by the browser.
  }
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? ''])
}

let current: Lang = 'zh'
let wanted: Lang = 'zh'
const listeners = new Set<() => void>()

function apply(lang: Lang) {
  document.documentElement.lang = localeOf(lang)
  if (lang === current) return
  current = lang
  for (const listener of listeners) listener()
}

async function load(lang: Lang) {
  const loader = loaders[`./locales/${lang}.ts`]
  if (loader) tables[lang] = await loader()
}

/** Shows `lang` once its table is in; a language picked meanwhile wins. */
function show(lang: Lang): Promise<void> {
  wanted = lang
  const done = () => {
    if (wanted === lang) apply(lang)
  }
  if (lang === 'zh' || tables[lang]) {
    done()
    return Promise.resolve()
  }
  // A table that cannot load still switches; its texts fall back to English.
  return load(lang).then(done, done)
}

/** Settles once the first language is ready; render after it so the page never flashes Chinese. */
export const i18nReady: Promise<void> = show(initialLang())

export function getLang(): Lang {
  return current
}

/** Switches the whole UI and remembers the choice for the next visit. */
export function setLang(lang: Lang): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // A choice that cannot be stored still applies for this visit.
  }
  return show(lang)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * UI text is written in Chinese in the code. This looks the Chinese up in the
 * current language's table (then English, then the Chinese itself) and fills
 * `{name}` placeholders from `vars`. A `|tag` after the Chinese ('模型|表头')
 * gives the same words their own translation in another role; the tag is
 * never shown.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const chinese = text.replace(/\|.*$/, '')
  const out = current === 'zh' ? chinese : (tables[current]?.[text] ?? EN[text] ?? chinese)
  if (!vars) return out
  return out.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/**
 * Marks Chinese text that is only stored where it is written (a module-level
 * list, say) so it is kept in the translation tables; pass it through t() when
 * it is shown.
 */
export function tk(text: string): string {
  return text
}

/** Use in any component that shows text, so it re-renders when the language changes. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang)
  return { lang, t, setLang }
}
