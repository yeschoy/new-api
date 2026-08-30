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
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, test } from 'vitest'

import { ToolList } from '../tool-list'

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Matching apps': 'Matching apps',
        'Green can connect directly. Yellow needs a file or has limits. Blue needs another protocol. Gray cannot set a custom Base URL.':
          'Green can connect directly. Yellow needs a file or has limits. Blue needs another protocol. Gray cannot set a custom Base URL.',
        'Search an app name': 'Search an app name',
        'No matching apps. Try another use case or search.':
          'No matching apps. Try another use case or search.',
        'Recommended for beginners': 'Recommended for beginners',
      },
    },
  },
})

describe('guide tool list empty state', () => {
  test('shows an empty state when the search matches no app', async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <ToolList useCase='all' />
      </I18nextProvider>
    )

    await user.type(
      screen.getByLabelText('Search an app name'),
      'not-a-real-app'
    )

    expect(
      screen.getByText('No matching apps. Try another use case or search.')
    ).toBeInTheDocument()
    expect(document.querySelector('[data-empty-tools]')).toBeInTheDocument()
    expect(document.querySelector('[data-tool="cherry-studio"]')).toBeNull()
  })
})
