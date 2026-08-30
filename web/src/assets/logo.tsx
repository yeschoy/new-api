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
import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
      height='24'
      width='24'
      fill='none'
      className={cn('size-6', className)}
      {...props}
    >
      <title>野草 API</title>
      <ellipse cx='9.2' cy='19.35' rx='1.7' ry='1.2' fill='currentColor' />
      <path
        fill='currentColor'
        d='M9.15 18.15c.85-4.7 3.15-9.15 7.95-13.55-2.35 2.85-4.35 7.05-5.55 11.55-.35 1.3-.9 2.05-1.7 2.35z'
      />
      <path
        d='M10.15 16.9c1.2-3.7 3.05-7.35 5.85-10.7'
        stroke='currentColor'
        strokeWidth='0.85'
        strokeLinecap='round'
        opacity='0.35'
      />
    </svg>
  )
}
