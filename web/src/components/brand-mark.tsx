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
 * The yeschoy mark: a bold lowercase y on a rounded square with its
 * bottom-left corner cut off, in the theme's primary color (violet by day,
 * lime by night). A logo set in the system settings replaces it.
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
      <path
        d='M6 0h12a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H8.5q-1 0-1.71-.71L.71 17.21Q0 16.5 0 15.5V6a6 6 0 0 1 6-6z'
        style={{ fill: 'var(--or-primary)' }}
      />
      <path
        d='M7.4 6.4l4.2 5.8M16.6 6.4l-6.4 11.2'
        fill='none'
        style={{ stroke: 'var(--or-bg)' }}
        strokeWidth='3.3'
        strokeLinecap='round'
      />
    </svg>
  )
}
