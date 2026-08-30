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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { USE_CASES } from '@/features/guide/constants'
import { USE_CASE_ICONS } from '@/features/guide/lib/use-case-icons'

export function UseCases() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 py-16 sm:px-6 md:py-20'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-8 max-w-2xl'>
          <p className='text-primary mb-2 text-xs font-medium'>
            {t('Start from a use case')}
          </p>
          <h2 className='font-serif text-3xl tracking-tight md:text-4xl'>
            {t('First tell us what you want to do.')}
          </h2>
        </AnimateInView>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {USE_CASES.map((useCase, index) => {
            const Icon = USE_CASE_ICONS[useCase.id]
            return (
              <AnimateInView key={useCase.id} delay={index * 60}>
                <Link
                  to='/guide'
                  search={{ use: useCase.id }}
                  className='bg-card/80 hover:border-primary/40 block rounded-2xl border px-5 py-4 transition-colors'
                >
                  <div className='flex items-center gap-2 font-medium'>
                    <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                      <Icon className='size-4' aria-hidden='true' />
                    </span>
                    <span>{t(useCase.labelKey)}</span>
                  </div>
                  <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                    {t(useCase.hintKey)}
                  </p>
                </Link>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
