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
import { AppWindow, FolderOpen, MessageSquare, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const FIRST_PICKS = [
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    whyKey: 'Chat, writing, and a simple OpenAI-compatible fill.',
    icon: MessageSquare,
  },
  {
    id: 'trae',
    name: 'Trae',
    whyKey: 'ByteDance AI IDE. Custom model with a Base URL switch.',
    icon: Terminal,
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    whyKey: 'Chinese office agent that can touch local files.',
    icon: FolderOpen,
  },
  {
    id: 'cline',
    name: 'Cline',
    whyKey: 'VS Code coding agent with a direct OpenAI Compatible fill.',
    icon: AppWindow,
  },
] as const

type FirstPicksProps = {
  onPick?: (id: string) => void
}

export function FirstPicks(props: FirstPicksProps) {
  const { t } = useTranslation()

  return (
    <section>
      <div className='mb-3'>
        <h2 className='font-serif text-2xl tracking-tight'>
          {t('If you are not sure which app to use')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('Start with one of these four. You can switch later.')}
        </p>
      </div>
      <div className='grid gap-2 sm:grid-cols-2'>
        {FIRST_PICKS.map((pick) => {
          const Icon = pick.icon
          return (
            <button
              key={pick.id}
              type='button'
              data-first-pick={pick.id}
              onClick={() => props.onPick?.(pick.id)}
              className='bg-card/80 hover:border-primary/40 rounded-2xl border px-4 py-3 text-left transition-colors'
            >
              <span className='flex items-center gap-2 text-sm font-medium'>
                <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                  <Icon className='size-4' aria-hidden='true' />
                </span>
                <span>{pick.name}</span>
              </span>
              <span className='text-muted-foreground mt-2 block text-xs leading-relaxed'>
                {t(pick.whyKey)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
