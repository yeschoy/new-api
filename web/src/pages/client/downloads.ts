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
export type DownloadPlatform = 'windows' | 'macos'

export type DownloadEnvironment = {
  userAgent: string
  platform: string
  maxTouchPoints: number
}

// The partner site ships its own build of the same installers.
const PARTNER_HOSTNAMES = new Set(['ai.yeschoy.io'])

const DOWNLOAD_URLS: Record<'official' | 'partner', Record<DownloadPlatform, string>> = {
  official: {
    windows: 'https://ergou.qzz.io/releases/official/yeschoy-windows-x86_64-installer.exe',
    macos: 'https://ergou.qzz.io/releases/official/yeschoy-macos-universal-installer.dmg',
  },
  partner: {
    windows: 'https://ergou.qzz.io/releases/partner/yeschoy-windows-x86_64-installer.exe',
    macos: 'https://ergou.qzz.io/releases/partner/yeschoy-macos-universal-installer.dmg',
  },
}

/** The installer that fits this browser, or null on phones, tablets and systems without one. */
export function detectDownloadPlatform(environment: DownloadEnvironment): DownloadPlatform | null {
  const userAgent = environment.userAgent.toLowerCase()
  const platform = environment.platform.toLowerCase()
  const mobile = /android|iphone|ipad|ipod/.test(userAgent)
  // iPadOS asks for desktop sites with a Mac user agent; only touch gives it away.
  const touchMac = platform.startsWith('mac') && environment.maxTouchPoints > 1
  if (mobile || touchMac) return null
  if (userAgent.includes('windows') || platform.startsWith('win')) return 'windows'
  if (userAgent.includes('macintosh') || userAgent.includes('mac os x') || platform.startsWith('mac')) return 'macos'
  return null
}

/** The installer address for a platform, from the channel of the site it is downloaded from. */
export function downloadUrl(platform: DownloadPlatform, hostname: string): string {
  const channel = PARTNER_HOSTNAMES.has(hostname.toLowerCase()) ? 'partner' : 'official'
  return DOWNLOAD_URLS[channel][platform]
}
