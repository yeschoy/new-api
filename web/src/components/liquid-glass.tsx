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
import { Button } from '@/components/ui/button'
import { usePointerGlass } from '@/hooks/use-pointer-glass'
import { cn } from '@/lib/utils'

type LiquidGlassProps = React.HTMLAttributes<HTMLDivElement> & {
  tilt?: boolean
  maxTilt?: number
  lift?: boolean
  variant?: 'default' | 'primary'
}

export function LiquidGlass(props: LiquidGlassProps) {
  const { className, tilt, maxTilt, lift, variant = 'default', ...rest } = props
  const glass = usePointerGlass<HTMLDivElement>({ tilt, maxTilt, lift })

  return (
    <div
      {...rest}
      ref={glass.ref}
      onPointerMove={glass.onPointerMove}
      onPointerEnter={glass.onPointerEnter}
      onPointerLeave={glass.onPointerLeave}
      onPointerDown={glass.onPointerDown}
      onPointerUp={glass.onPointerUp}
      onPointerCancel={glass.onPointerCancel}
      className={cn(
        variant === 'primary' ? 'liquid-glass-primary' : 'liquid-glass',
        'liquid-glass-interactive',
        className
      )}
    />
  )
}

type LiquidGlassButtonProps = React.ComponentProps<typeof Button> & {
  glass?: 'default' | 'primary'
}

export function LiquidGlassButton(props: LiquidGlassButtonProps) {
  const { className, glass = 'primary', ...rest } = props
  const pointer = usePointerGlass<HTMLButtonElement>()

  return (
    <Button
      {...rest}
      {...pointer}
      className={cn(
        glass === 'primary' ? 'liquid-glass-primary' : 'liquid-glass',
        'liquid-glass-interactive',
        className
      )}
    />
  )
}
