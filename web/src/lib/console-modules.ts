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

type Section = { enabled?: boolean } & Record<string, boolean | undefined>
type Config = Record<string, Section>

/** What the console shows when the admin has saved nothing, as the old console did. */
const DEFAULTS: Config = {
  chat: { enabled: true, playground: true, chat: true },
  console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
  personal: { enabled: true, topup: true, personal: true },
  admin: { enabled: true, channel: true, models: true, redemption: true, user: true, setting: true, subscription: true },
}

function parse(raw: string | undefined): Config | null {
  if (!raw?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Config) : null
  } catch {
    return null
  }
}

/** The admin's console switches (status.SidebarModulesAdmin) filled in with the defaults. */
function adminConfig(raw: string | undefined): Config {
  const saved = parse(raw)
  if (!saved) return DEFAULTS
  const merged: Config = { ...saved }
  for (const [name, defaults] of Object.entries(DEFAULTS)) {
    merged[name] = { ...defaults, ...saved[name] }
  }
  return merged
}

/**
 * Whether a console module is on: the admin's switches decide first, then the
 * user's own preference (the user's sidebar_modules) can hide more but never
 * show what the admin hid. Same rules as the old console.
 */
export function consoleModuleOn(adminRaw: string | undefined, userRaw: string | undefined, section: string, module: string): boolean {
  const admin = adminConfig(adminRaw)[section]
  if (!admin?.enabled || admin[module] !== true) return false
  const userSection = parse(userRaw)?.[section]
  if (!userSection) return true
  if (userSection.enabled === false) return false
  return userSection[module] !== false
}
