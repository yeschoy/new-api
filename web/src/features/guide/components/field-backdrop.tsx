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

type FieldBackdropProps = {
  className?: string
}

const FIREFLIES = [
  { left: '12%', top: '28%', delay: '0s', size: '3px' },
  { left: '22%', top: '62%', delay: '1.4s', size: '2px' },
  { left: '38%', top: '18%', delay: '2.1s', size: '4px' },
  { left: '48%', top: '72%', delay: '0.6s', size: '2px' },
  { left: '63%', top: '34%', delay: '2.8s', size: '3px' },
  { left: '74%', top: '58%', delay: '1.1s', size: '2px' },
  { left: '86%', top: '22%', delay: '3.2s', size: '3px' },
  { left: '91%', top: '78%', delay: '1.8s', size: '2px' },
] as const

const BLADES = [
  { left: '4%', height: '9rem', delay: '', d: 'M12 64 C11 40 7 22 4 2' },
  {
    left: '9%',
    height: '12rem',
    delay: 'yecao-blade-delay',
    d: 'M10 64 C14 38 18 20 22 1',
  },
  { left: '15%', height: '10rem', delay: '', d: 'M12 64 C9 36 10 18 7 0' },
  {
    left: '78%',
    height: '11rem',
    delay: 'yecao-blade-delay',
    d: 'M12 64 C15 40 17 18 21 2',
  },
  { left: '86%', height: '13rem', delay: '', d: 'M12 64 C8 38 9 16 6 0' },
  {
    left: '93%',
    height: '9rem',
    delay: 'yecao-blade-delay',
    d: 'M12 64 C13 42 16 22 19 3',
  },
] as const

export function FieldBackdrop(props: FieldBackdropProps) {
  return (
    <div
      className={cn(
        'yecao-field pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        props.className
      )}
      aria-hidden='true'
    >
      <div className='yecao-aurora absolute inset-0' />
      <div className='yecao-grain absolute inset-0 opacity-[0.11] mix-blend-multiply dark:opacity-[0.18] dark:mix-blend-screen' />
      {FIREFLIES.map((firefly) => (
        <span
          key={`${firefly.left}-${firefly.top}`}
          className='yecao-firefly'
          style={{
            left: firefly.left,
            top: firefly.top,
            width: firefly.size,
            height: firefly.size,
            animationDelay: firefly.delay,
          }}
        />
      ))}
      {BLADES.map((blade) => (
        <svg
          key={blade.left}
          className='text-primary/35 dark:text-primary/28 absolute -bottom-8 w-16'
          style={{ left: blade.left, height: blade.height }}
          viewBox='0 0 24 64'
          fill='none'
        >
          <path
            className={cn('yecao-blade', blade.delay)}
            d={blade.d}
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </svg>
      ))}
    </div>
  )
}
