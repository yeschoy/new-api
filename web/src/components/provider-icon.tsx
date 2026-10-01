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
import { useEffect, useSyncExternalStore, type ComponentType } from 'react'

type IconComponent = ComponentType<{ size?: number }> & {
  Color?: ComponentType<{ size?: number }>
  Avatar?: ComponentType<{ size?: number }>
}
type Registry = Record<string, IconComponent | undefined>

// The icon library is several MB, so it loads once, on demand, in its own
// chunk; until then every icon renders its letter fallback.
let registry: Registry | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function loadRegistry() {
  if (loading) return
  loading = import('@lobehub/icons')
    .then((module) => {
      registry = module as unknown as Registry
      for (const listener of listeners) listener()
    })
    .catch(() => {
      // Icons are decorative; keep the letter fallback if the chunk fails.
    })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useRegistry(): Registry | null {
  useEffect(loadRegistry, [])
  return useSyncExternalStore(subscribe, () => registry, () => registry)
}

/**
 * Resolves a provider icon name as stored by the backend ("OpenAI",
 * "Claude.Color", "Gemini.Avatar") into a @lobehub/icons component.
 * Unknown names, and names not loaded yet, fall back to the first letter.
 */
export function ProviderIcon(props: {
  name?: string
  fallback?: string
  size?: number
  className?: string
}) {
  const icons = useRegistry()
  const size = props.size ?? 20
  const [base, variant] = (props.name ?? '').split('.')
  const icon = base && icons ? icons[base] : undefined
  let Component: ComponentType<{ size?: number }> | undefined = icon
  if (icon && variant === 'Color' && icon.Color) Component = icon.Color
  if (icon && variant === 'Avatar' && icon.Avatar) Component = icon.Avatar

  if (!Component) {
    const letter = (props.fallback ?? props.name ?? '?').charAt(0).toUpperCase()
    return (
      <span
        aria-hidden='true'
        className={props.className}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
        }}
      >
        {letter}
      </span>
    )
  }
  return (
    <span aria-hidden='true' className={props.className} style={{ display: 'inline-flex' }}>
      <Component size={size} />
    </span>
  )
}
