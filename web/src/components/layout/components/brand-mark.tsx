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
import { Logo } from '@/assets/logo'
import { isDefaultLogo } from '@/lib/constants'
import { cn } from '@/lib/utils'

type BrandMarkProps = {
  src?: string | null
  alt?: string
  className?: string
}

export function BrandMark(props: BrandMarkProps) {
  if (isDefaultLogo(props.src)) {
    return (
      <span
        className={cn(
          'bg-primary/12 text-primary inline-flex items-center justify-center rounded-[22%]',
          props.className
        )}
        role={props.alt ? 'img' : undefined}
        aria-label={props.alt}
        aria-hidden={props.alt ? undefined : true}
      >
        <Logo className='size-[78%]' aria-hidden />
      </span>
    )
  }

  return (
    <img
      src={props.src ?? ''}
      alt={props.alt ?? ''}
      className={cn('size-full object-contain', props.className)}
    />
  )
}
