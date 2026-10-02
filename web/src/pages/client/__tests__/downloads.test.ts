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
import { detectDownloadPlatform, downloadUrl, type DownloadEnvironment } from '../downloads'

const WINDOWS: DownloadEnvironment = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 0,
}

const MACOS: DownloadEnvironment = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 0,
}

// iPadOS asks for the desktop site with a Mac user agent; only the touch points give it away.
const IPAD: DownloadEnvironment = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  platform: 'MacIntel',
  maxTouchPoints: 5,
}

const ANDROID: DownloadEnvironment = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
}

const LINUX: DownloadEnvironment = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0',
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
}

const OFFICIAL = {
  windows: 'https://ergou.qzz.io/releases/official/yeschoy-windows-x86_64-installer.exe',
  macos: 'https://ergou.qzz.io/releases/official/yeschoy-macos-universal-installer.dmg',
}

const PARTNER = {
  windows: 'https://ergou.qzz.io/releases/partner/yeschoy-windows-x86_64-installer.exe',
  macos: 'https://ergou.qzz.io/releases/partner/yeschoy-macos-universal-installer.dmg',
}

describe('detectDownloadPlatform', () => {
  it.each([
    ['a Windows browser', WINDOWS, 'windows'],
    ['a Mac browser', MACOS, 'macos'],
    ['an iPad asking for the desktop site', IPAD, null],
    ['an Android phone', ANDROID, null],
    ['a Linux desktop', LINUX, null],
    ['a browser that tells nothing', { userAgent: '', platform: '', maxTouchPoints: 0 }, null],
  ] as const)('detects the installer for %s', (_name, environment, expected) => {
    expect(detectDownloadPlatform(environment)).toBe(expected)
  })
})

describe('downloadUrl', () => {
  it.each([
    ['ai.yeschoy.io', PARTNER],
    ['AI.YESCHOY.IO', PARTNER],
    ['ai.yeschoy.com', OFFICIAL],
    ['www.ai.yeschoy.io', OFFICIAL],
    ['ai.yeschoy.io.example.com', OFFICIAL],
    ['localhost', OFFICIAL],
    ['', OFFICIAL],
  ])('serves the installers for host %s from its own channel', (hostname, urls) => {
    expect(downloadUrl('windows', hostname)).toBe(urls.windows)
    expect(downloadUrl('macos', hostname)).toBe(urls.macos)
  })
})
