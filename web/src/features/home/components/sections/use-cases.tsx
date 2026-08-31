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
import { LiquidGlass } from '@/components/liquid-glass'
import { USE_CASES } from '@/features/guide/constants'
import { USE_CASE_ICONS } from '@/features/guide/lib/use-case-icons'

export function UseCases() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 py-16 sm:px-6 md:py-20'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 text-center'>
          <p className='text-muted-foreground mb-3 text-sm tracking-wide'>
            {t('Start from a use case')}
          </p>
          <h2 className='text-3xl font-semibold tracking-tight text-balance md:text-4xl'>
            {t('First tell us what you want to do.')}
          </h2>
        </AnimateInView>
        <div className='flex flex-wrap justify-center gap-3'>
          {USE_CASES.map((useCase, index) => {
            const Icon = USE_CASE_ICONS[useCase.id]
            return (
              <AnimateInView key={useCase.id} delay={index * 50}>
                <LiquidGlass className='rounded-full border'>
                  <Link
                    to='/guide'
                    search={{ use: useCase.id }}
                    className='flex items-center gap-2.5 px-4 py-2.5'
                  >
                    <Icon className='size-4' aria-hidden='true' />
                    <span className='text-sm font-medium'>
                      {t(useCase.labelKey)}
                    </span>
                  </Link>
                </LiquidGlass>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
