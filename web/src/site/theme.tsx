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
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ResolvedTheme = 'light' | 'dark'

/** A theme picked with the header button. It holds until the clock next switches. */
type Pick = { theme: ResolvedTheme; until: number }

const STORAGE_KEY = 'theme-mode'
const DAY_START = 6
const NIGHT_START = 18

/** The visitor's clock decides: day (06:00–18:00) light, night dark. */
export function clockTheme(now: Date): ResolvedTheme {
  const hour = now.getHours()
  return hour >= DAY_START && hour < NIGHT_START ? 'light' : 'dark'
}

/** The next 06:00 or 18:00 after `now`, on the visitor's clock. */
function nextSwitch(now: Date): number {
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  const hour = now.getHours()
  if (hour < DAY_START) {
    next.setHours(DAY_START)
  } else if (hour < NIGHT_START) {
    next.setHours(NIGHT_START)
  } else {
    next.setDate(next.getDate() + 1)
    next.setHours(DAY_START)
  }
  return next.getTime()
}

function readPick(): Pick | null {
  try {
    const pick = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Pick | null
    if (pick && (pick.theme === 'light' || pick.theme === 'dark') && typeof pick.until === 'number') return pick
  } catch {
    // Storage may be unavailable or hold the old for-good 'light' / 'dark'; follow the clock.
  }
  return null
}

type ThemeContextValue = {
  theme: ResolvedTheme
  /** Flips day ↔ night until the clock next switches. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider(props: { children: React.ReactNode }) {
  const [pick, setPick] = useState<Pick | null>(readPick)
  const [now, setNow] = useState(() => new Date())
  const theme = pick && now.getTime() < pick.until ? pick.theme : clockTheme(now)

  // Re-check the clock every minute, so dusk and dawn flip the theme and end a pick.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  const toggle = useCallback(() => {
    const at = new Date()
    const next: Pick = { theme: theme === 'dark' ? 'light' : 'dark', until: nextSwitch(at) }
    setNow(at)
    setPick(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // A pick that cannot be stored still applies for this visit.
    }
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext value={value}>{props.children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
