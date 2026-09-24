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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * The UI ships two complete reference designs. `router` is the dark catalog
 * design, `hub` the light gateway design. Visitors switch between them with
 * the floating switcher; the choice is remembered per browser.
 */
export type SiteSkin = 'router' | 'hub'

const STORAGE_KEY = 'site-skin'

type SkinContextValue = { skin: SiteSkin; setSkin: (skin: SiteSkin) => void }

const SkinContext = createContext<SkinContextValue | null>(null)

function readStoredSkin(): SiteSkin {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'router' || stored === 'hub') return stored
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return 'router'
}

export function SiteSkinProvider(props: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<SiteSkin>(readStoredSkin)

  const setSkin = useCallback((next: SiteSkin) => {
    setSkinState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-persistent switch is still fine for the current visit.
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = skin
    root.classList.toggle('dark', skin === 'router')
    root.style.colorScheme = skin === 'router' ? 'dark' : 'light'
  }, [skin])

  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin])
  return <SkinContext value={value}>{props.children}</SkinContext>
}

export function useSiteSkin(): SkinContextValue {
  const value = useContext(SkinContext)
  if (!value) throw new Error('useSiteSkin must be used inside SiteSkinProvider')
  return value
}

/** Renders the design-specific implementation of a page. */
export function BySkin(props: { router: React.ReactNode; hub: React.ReactNode }) {
  const { skin } = useSiteSkin()
  return <>{skin === 'router' ? props.router : props.hub}</>
}
