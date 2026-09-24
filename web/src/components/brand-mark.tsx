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
import { useBrand } from '@/lib/queries'

/**
 * Operator logo from system settings, or a neutral placeholder glyph drawn
 * in the theme's primary color (violet by day, lime by night).
 */
export function BrandMark(props: { size?: number; className?: string }) {
  const brand = useBrand()
  const size = props.size ?? 24
  if (brand.logo) {
    return (
      <img
        src={brand.logo}
        alt=''
        width={size}
        height={size}
        className={props.className}
        style={{ objectFit: 'contain' }}
      />
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={props.className}
    >
      <rect width='24' height='24' rx='6' style={{ fill: 'var(--or-primary)' }} />
      <path
        d='M6.5 16.5v-9l5.5 5.5 5.5-5.5v9'
        fill='none'
        style={{ stroke: 'var(--or-bg)' }}
        strokeWidth='2.2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
