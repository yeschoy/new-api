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
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, test } from 'vitest'

import type { UseCaseId } from '../../types'
import { UseCasePicker } from '../use-case-picker'

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'What do you want to do?': 'What do you want to do?',
        'Pick a use case first. We will only show matching apps.':
          'Pick a use case first. We will only show matching apps.',
        'Show every app': 'Show every app',
        'Browse the full list when you already know the name':
          'Browse the full list when you already know the name',
        'Chat and writing': 'Chat and writing',
        'Everyday chat, writing, and reading files':
          'Everyday chat, writing, and reading files',
        'Write code': 'Write code',
        'Editors, terminals, and coding agents':
          'Editors, terminals, and coding agents',
      },
    },
  },
})

function PickerHarness() {
  const [value, setValue] = useState<UseCaseId | 'all'>('chat')
  return (
    <I18nextProvider i18n={i18n}>
      <UseCasePicker value={value} onChange={setValue} />
    </I18nextProvider>
  )
}

describe('guide use-case picker', () => {
  test('marks the selected use case and updates aria-checked after a click', async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    const chat = screen.getByRole('radio', { name: /Chat and writing/i })
    const code = screen.getByRole('radio', { name: /Write code/i })

    expect(chat).toHaveAttribute('aria-checked', 'true')
    expect(code).toHaveAttribute('aria-checked', 'false')

    await user.click(code)

    expect(code).toHaveAttribute('aria-checked', 'true')
    expect(chat).toHaveAttribute('aria-checked', 'false')
  })
})
