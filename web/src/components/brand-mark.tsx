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
 * The yeschoy mark: a bold lowercase y cut out of a slanted block in the
 * theme's primary color (violet by day, lime by night). The block's right edge
 * follows the y's long stroke and its bottom-left corner is cut along the short
 * one. A logo set in the system settings replaces it.
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
        d='M2.2 1.2h19.6q1.8 0 1 1.7l-7.3 18.4q-.9 1.9-2.9 1.9H7.47q-1 0-1.59-.81L1.99 17.01q-.59-.81-.59-1.81V2.4q0-1.2.8-1.2z'
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
