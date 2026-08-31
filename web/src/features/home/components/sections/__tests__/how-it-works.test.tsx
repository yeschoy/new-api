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
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, test } from 'vitest'

class IntersectionObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: IntersectionObserverMock,
})

const { HowItWorks } = await import('../how-it-works')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Three things.': 'Three things.',
        'Three steps. No server knowledge required.':
          'Three steps. No server knowledge required.',
        'Create a key': 'Create a key',
        'Paste these three fields': 'Paste these three fields',
        'Send 你好': 'Send 你好',
        'Pick a model and a rate group, then create one key per app.':
          'Pick a model and a rate group, then create one key per app.',
        'Paste Base URL, API Key, and Model ID into the app you already use.':
          'Paste Base URL, API Key, and Model ID into the app you already use.',
        'Paste the exact model ID, save, and send a short hello. If it replies, you are done.':
          'Paste the exact model ID, save, and send a short hello. If it replies, you are done.',
        'API Key created': 'API Key created',
        'Pick a rate group': 'Pick a rate group',
        'Base URL': 'Base URL',
        'API Key': 'API Key',
        'Model ID': 'Model ID',
        'It replied.': 'It replied.',
      },
    },
  },
})

describe('landing how it works', () => {
  test('shows three numbered product mocks instead of icon steps', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <HowItWorks />
      </I18nextProvider>
    )

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(document.querySelector('.liquid-glass')).not.toBeNull()
    expect(screen.getByText('API Key created')).toBeInTheDocument()
    expect(screen.getByText('It replied.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Pick a model and a rate group, then create one key per app.'
      )
    ).toBeInTheDocument()
  })
})
