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
import { cn } from '@/lib/format'

import { useSiteSkin, type SiteSkin } from './site-skin'

const OPTIONS: Array<{ id: SiteSkin; label: string }> = [
  { id: 'router', label: 'OpenRouter 版' },
  { id: 'hub', label: 'AIHubMix 版' },
]

/** Floating control to flip between the two reference designs. */
export function SkinSwitcher() {
  const { skin, setSkin } = useSiteSkin()
  return (
    <div
      role='radiogroup'
      aria-label='设计版本'
      className='fixed right-4 bottom-4 z-[100] flex gap-1 rounded-full border border-black/10 bg-white/95 p-1 text-[12px] shadow-lg backdrop-blur'
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type='button'
          role='radio'
          aria-checked={skin === option.id}
          onClick={() => setSkin(option.id)}
          className={cn(
            'rounded-full px-3 py-1.5 font-medium transition-colors',
            skin === option.id
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-600 hover:text-neutral-900'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
