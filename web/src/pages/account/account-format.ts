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
import { getLang, localeOf, t } from '@/i18n/i18n'

const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
]

/** "2 分钟前", "2 minutes ago", … for a Unix time, in the current language. */
export function relativeTime(seconds: number, now = Date.now()): string {
  if (!seconds) return '—'
  const format = new Intl.RelativeTimeFormat(localeOf(getLang()), { numeric: 'auto' })
  let value = seconds - Math.floor(now / 1000)
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return format.format(Math.round(value), unit)
    value /= size
  }
  return format.format(Math.round(value), 'year')
}

/** "Chrome · Windows" from a browser's user agent. */
export function deviceName(userAgent: string, maxTouchPoints = 0): string {
  if (!userAgent) return t('未知设备')
  let browser = t('浏览器')
  if (userAgent.includes('Edg/')) browser = 'Edge'
  else if (userAgent.includes('Chrome/')) browser = 'Chrome'
  else if (userAgent.includes('Firefox/')) browser = 'Firefox'
  else if (userAgent.includes('Safari/')) browser = 'Safari'

  let system = ''
  const iPad = userAgent.includes('iPad') || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  if (userAgent.includes('iPhone') || iPad) system = 'iOS'
  else if (userAgent.includes('Android')) system = 'Android'
  else if (userAgent.includes('Windows')) system = 'Windows'
  else if (userAgent.includes('Mac OS')) system = 'macOS'
  else if (userAgent.includes('Linux')) system = 'Linux'
  return system ? `${browser} · ${system}` : browser
}

const PROVIDERS: Record<string, string> = { discord: 'Discord', github: 'GitHub', linuxdo: 'LinuxDO', oidc: 'OIDC' }

/** How a session signed in: password, 2fa, passkey, wechat, telegram, oauth or oauth:<provider>. */
export function loginMethodLabel(method: string): string {
  const normalized = method.trim().toLowerCase()
  switch (normalized) {
    case 'password':
      return t('密码')
    case '2fa':
      return t('两步验证')
    case 'passkey':
      return 'Passkey'
    case 'wechat':
      return t('微信')
    case 'telegram':
      return 'Telegram'
    case 'oauth':
      return t('第三方登录')
    case '':
    case 'unknown':
      return t('未知')
    default:
      break
  }
  if (!normalized.startsWith('oauth:')) return method
  const provider = normalized.slice('oauth:'.length)
  return `${t('第三方登录')} · ${PROVIDERS[provider] ?? provider}`
}
