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
import { LANGUAGES, getLang, setLang, type Lang } from '@/i18n/i18n'

// The old site saved zhCN / zhTW; browsers and the backend speak zh-CN / zh-TW.
const ALIASES: Record<string, Lang> = {
  zhcn: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  zhtw: 'zh-TW',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-hant': 'zh-TW',
}

/** A saved language value as one of the site's languages, or null. */
export function toLang(value: unknown): Lang | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const lower = value.trim().replace('_', '-').toLowerCase()
  if (ALIASES[lower]) return ALIASES[lower]
  return LANGUAGES.find((item) => item.id.toLowerCase() === lower)?.id ?? null
}

/** The language kept in the account's settings (the user's `setting` JSON). */
export function settingLanguage(setting: unknown): Lang | null {
  if (typeof setting !== 'string' || !setting) return null
  try {
    return toLang((JSON.parse(setting) as { language?: unknown }).language)
  } catch {
    return null
  }
}

/** After signing in, the page follows the language saved in the account, as on the old site. */
export function applySavedLanguage(user: unknown) {
  const lang = settingLanguage((user as { setting?: unknown } | null)?.setting)
  if (lang && lang !== getLang()) void setLang(lang)
}
