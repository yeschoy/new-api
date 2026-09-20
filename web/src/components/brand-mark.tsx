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
import { useSystemConfig } from '@/hooks/use-system-config'
import { resolveProductName } from '@/lib/product-brand'
import { cn } from '@/lib/utils'

type BrandMarkProps = {
  /** Diameter of the mark in pixels. */
  size?: number
  /** Show the product name beside the mark. */
  withWordmark?: boolean
  className?: string
}

/**
 * Product mark used across the public site, sign-in and console chrome.
 *
 * The image comes from the operator's configured logo so a white-label
 * deployment keeps its own identity; the default is the editorial seal in
 * `public/brand-mark.svg`.
 */
export function BrandMark(props: BrandMarkProps) {
  const { logo, systemName } = useSystemConfig()
  const size = props.size ?? 28
  const name = resolveProductName(systemName)

  return (
    <span
      className={cn('ed-brand', props.className)}
      data-slot='brand-mark'
      style={{ gap: props.withWordmark ? undefined : 0 }}
    >
      <span
        className='ed-brandMark'
        style={{ inlineSize: size, blockSize: size }}
        aria-hidden='true'
      >
        <img src={logo} alt='' width={size} height={size} />
      </span>
      {props.withWordmark ? <span className='ed-brandName'>{name}</span> : null}
    </span>
  )
}
