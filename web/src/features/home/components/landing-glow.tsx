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
import { cn } from '@/lib/utils'

type LandingGlowProps = {
  className?: string
}

export function LandingGlow(props: LandingGlowProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        props.className
      )}
      aria-hidden='true'
    >
      <div className='landing-glow absolute inset-0' />
      <div className='landing-orb' />
      <div className='landing-grid absolute inset-0' />
    </div>
  )
}
