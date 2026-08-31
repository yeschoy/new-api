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

import { AnimateInView } from '@/components/animate-in-view'

import { HelloMock, KeyCreatedMock, PasteFieldsMock } from '../step-mock-cards'

const STEPS = [
  {
    num: '01',
    titleKey: 'Create a key',
    hintKey: 'Pick a model and a rate group, then create one key per app.',
    Mock: KeyCreatedMock,
  },
  {
    num: '02',
    titleKey: 'Paste these three fields',
    hintKey:
      'Paste Base URL, API Key, and Model ID into the app you already use.',
    Mock: PasteFieldsMock,
  },
  {
    num: '03',
    titleKey: 'Send 你好',
    hintKey:
      'Paste the exact model ID, save, and send a short hello. If it replies, you are done.',
    Mock: HelloMock,
  },
] as const

export function HowItWorks() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 py-20 sm:px-6 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-14 text-center md:mb-16'>
          <p className='text-muted-foreground mb-3 text-sm tracking-wide'>
            {t('Three things.')}
          </p>
          <h2 className='text-3xl font-semibold tracking-tight text-balance md:text-5xl'>
            {t('Three steps. No server knowledge required.')}
          </h2>
        </AnimateInView>

        <div className='grid gap-10 md:grid-cols-3 md:gap-8'>
          {STEPS.map((step, i) => {
            const Mock = step.Mock
            return (
              <AnimateInView
                key={step.num}
                delay={i * 120}
                animation='fade-up'
                className='flex flex-col gap-5'
              >
                <div>
                  <p className='text-muted-foreground font-mono text-xs tracking-widest'>
                    {step.num}
                  </p>
                  <h3 className='mt-2 text-lg font-semibold tracking-tight'>
                    {t(step.titleKey)}
                  </h3>
                  <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                    {t(step.hintKey)}
                  </p>
                </div>
                <Mock />
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
