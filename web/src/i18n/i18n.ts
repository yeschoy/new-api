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

export type Lang = 'zh' | 'en'

/** Languages offered in the switcher, each named in its own language. The site opens in Chinese. */
export const LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'zh', label: '简体中文' },
  { id: 'en', label: 'English' },
]

const STORAGE_KEY = 'lang'
const HTML_LANG: Record<Lang, string> = { zh: 'zh-CN', en: 'en' }

function readStored(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    // Storage may be unavailable; fall back to Chinese.
  }
  return 'zh'
}

let current: Lang = readStored()
const listeners = new Set<() => void>()
document.documentElement.lang = HTML_LANG[current]

export function getLang(): Lang {
  return current
}

/** Switches the whole UI and remembers the choice for the next visit. */
export function setLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // A choice that cannot be stored still applies for this visit.
  }
  document.documentElement.lang = HTML_LANG[lang]
  if (lang === current) return
  current = lang
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * UI text is written in Chinese in the code. This looks the Chinese up in the
 * current language's table (keeping the Chinese when there is no entry) and
 * fills `{name}` placeholders from `vars`. A `|tag` after the Chinese
 * ('模型|表头') gives the same words their own English in another role; the
 * tag is never shown.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const chinese = text.replace(/\|.*$/, '')
  const out = current === 'en' ? (EN[text] ?? chinese) : chinese
  if (!vars) return out
  return out.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/**
 * Marks Chinese text that is only stored where it is written (a module-level
 * list, say) so it is kept in the translation table; pass it through t() when
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
