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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'

import { ErrorDecoder } from './components/error-decoder'
import { FieldBackdrop } from './components/field-backdrop'
import { FirstPicks } from './components/first-picks'
import { StarterKitCard } from './components/starter-kit-card'
import { ToolList } from './components/tool-list'
import { UseCasePicker } from './components/use-case-picker'
import { GUIDE_UPDATED_AT } from './constants'
import { isUseCaseId } from './lib/use-case'
import type { UseCaseId } from './types'

type GuidePageProps = {
  initialUseCase?: string
}

export function GuidePage(props: GuidePageProps) {
  const { t } = useTranslation()
  const [useCase, setUseCase] = useState<UseCaseId | 'all'>(() =>
    isUseCaseId(props.initialUseCase) ? props.initialUseCase : 'chat'
  )

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative overflow-hidden pt-20'>
        <FieldBackdrop />
        <main className='mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 pb-20 sm:px-6'>
          <header className='max-w-3xl'>
            <p className='text-primary text-xs font-medium'>
              {t('Usage guide')}
            </p>
            <h1 className='mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl'>
              {t('How to fill this into an app')}
            </h1>
            <p className='text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed'>
              {t(
                'Copy a key, an address, and a model name. Then send 你好. That is enough to get started.'
              )}{' '}
              {t(
                'If you are not sure which app to use, start with Cherry Studio for chat or Trae for writing code.'
              )}
            </p>
            <p className='text-muted-foreground mt-3 text-xs'>
              {t('Updated {{date}}', { date: GUIDE_UPDATED_AT })}
            </p>
          </header>

          <StarterKitCard />
          <FirstPicks
            onPick={(id) => {
              setUseCase('all')
              window.setTimeout(() => {
                document
                  .querySelector(`#tool-${id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }, 50)
            }}
          />
          <UseCasePicker value={useCase} onChange={setUseCase} />
          <ToolList useCase={useCase} />
          <ErrorDecoder />
        </main>
        <Footer />
      </div>
    </PublicLayout>
  )
}
