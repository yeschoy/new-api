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
import { useTranslation } from 'react-i18next'

import { LiquidGlass } from '@/components/liquid-glass'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

const TOOLS = [
  { name: 'Cherry Studio', icon: 'CherryStudio.Color' },
  { name: 'Trae', icon: 'Trae.Color' },
  { name: 'Cursor', icon: 'Cursor' },
  { name: 'Cline', icon: 'Cline' },
  { name: 'Claude Code', icon: 'ClaudeCode.Color' },
  { name: 'WorkBuddy', icon: 'CodeBuddy.Color' },
  { name: 'LobeChat', icon: 'LobeHub.Color' },
] as const

type ToolLogoRowProps = {
  className?: string
}

export function ToolLogoRow(props: ToolLogoRowProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex flex-col items-center gap-5', props.className)}>
      <p className='text-muted-foreground text-xs tracking-wide'>
        {t('Works with')}
      </p>
      <LiquidGlass className='rounded-2xl border'>
        <ul className='flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-5 py-3'>
          {TOOLS.map((tool) => (
            <li
              key={tool.name}
              className='text-muted-foreground hover:text-foreground flex items-center gap-2.5 rounded-full px-1.5 py-1 transition-transform duration-200 hover:scale-110'
            >
              <span className='flex size-7 items-center justify-center'>
                {getLobeIcon(tool.icon, 22)}
              </span>
              <span className='text-sm font-medium'>{tool.name}</span>
            </li>
          ))}
        </ul>
      </LiquidGlass>
    </div>
  )
}
