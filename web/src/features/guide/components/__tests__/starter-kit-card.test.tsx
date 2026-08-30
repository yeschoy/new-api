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
import { describe, expect, test, vi } from 'vitest'

const { TooltipProvider } = await import('@/components/ui/tooltip')

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { auth: { user: null } }) => unknown) =>
    selector({ auth: { user: null } }),
}))

const { StarterKitCard } = await import('../starter-kit-card')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'The only three fields': 'The only three fields',
        'Key, address, model': 'Key, address, model',
        'Copy these three things into any OpenAI-compatible app. That is the whole setup.':
          'Copy these three things into any OpenAI-compatible app. That is the whole setup.',
        'Network line': 'Network line',
        'Mainland line': 'Mainland line',
        'Global line': 'Global line',
        'This site': 'This site',
        'Best for networks in mainland China':
          'Best for networks in mainland China',
        'Cloudflare acceleration for overseas and cross-border networks':
          'Cloudflare acceleration for overseas and cross-border networks',
        'The address of the site you are on right now':
          'The address of the site you are on right now',
        'Address box type': 'Address box type',
        'Base URL': 'Base URL',
        'API Host': 'API Host',
        'API Path': 'API Path',
        'Full URL': 'Full URL',
        'Use this when the app asks for Base URL, API Base, or API address':
          'Use this when the app asks for Base URL, API Base, or API address',
        'Use this when the app asks for API Host or Host only':
          'Use this when the app asks for API Host or Host only',
        'Keep this path if the app has a separate path box':
          'Keep this path if the app has a separate path box',
        'Use this when the app asks for a full endpoint':
          'Use this when the app asks for a full endpoint',
        'Never paste Base URL and Full URL into the same box.':
          'Never paste Base URL and Full URL into the same box.',
        'API Key': 'API Key',
        'Sign in, create a key, then come back and copy these fields.':
          'Sign in, create a key, then come back and copy these fields.',
        'Sign in': 'Sign in',
        'Model ID': 'Model ID',
        'Copy the exact ID from the pricing page':
          'Copy the exact ID from the pricing page',
        'The model ID must match the pricing page character for character.':
          'The model ID must match the pricing page character for character.',
        'Open model pricing': 'Open model pricing',
        'Copy to clipboard': 'Copy to clipboard',
        'Copied!': 'Copied!',
        Copied: 'Copied',
      },
    },
  },
})

function renderKit(origin: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <StarterKitCard origin={origin} />
      </TooltipProvider>
    </I18nextProvider>
  )
}

describe('starter kit address switching', () => {
  test('shows mainland Base URL by default on the official host', () => {
    renderKit('https://yeschoy.com')

    expect(
      screen.getByRole('radio', { name: 'Mainland line' })
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('https://yeschoy.com/v1')).toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: 'This site' })
    ).not.toBeInTheDocument()
  })

  test('switches to the global Full URL when the user changes line and address type', async () => {
    const user = userEvent.setup()
    renderKit('https://yeschoy.com')

    await user.click(screen.getByRole('radio', { name: 'Global line' }))
    await user.click(screen.getByRole('radio', { name: 'Full URL' }))

    expect(
      screen.getByText('https://api.yeschoy.com/v1/chat/completions')
    ).toBeInTheDocument()
  })

  test('exposes a this-site line on local origins and copies that origin', async () => {
    const user = userEvent.setup()
    renderKit('http://localhost:5173')

    const current = screen.getByRole('radio', { name: 'This site' })
    expect(current).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: 'API Host' }))
    expect(screen.getByText('http://localhost:5173')).toBeInTheDocument()
  })
})
