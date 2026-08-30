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
import { describe, expect, test, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { auth: { user: null } }) => unknown) =>
    selector({ auth: { user: null } }),
}))

const { TooltipProvider } = await import('@/components/ui/tooltip')
const { BeginnerHomeView } = await import('../beginner-home')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Hello, {{name}}': 'Hello, {{name}}',
        'Today you only need three steps: create a key, copy the address, then send 你好 in your app.':
          'Today you only need three steps: create a key, copy the address, then send 你好 in your app.',
        'Create your first key': 'Create your first key',
        'Manage keys': 'Manage keys',
        'My API Keys': 'My API Keys',
        'How to fill this into an app': 'How to fill this into an app',
        'You do not have a key yet': 'You do not have a key yet',
        'You have {{count}} keys': 'You have {{count}} keys',
        Balance: 'Balance',
        'Add balance': 'Add balance',
        Usage: 'Usage',
        'Used {{count}} times': 'Used {{count}} times',
        'The only three fields': 'The only three fields',
        'Key, address, model': 'Key, address, model',
        'Fill these three things into the app you already use.':
          'Fill these three things into the app you already use.',
        'Model Square': 'Model Square',
        'Network line': 'Network line',
        'This site': 'This site',
        'Mainland line': 'Mainland line',
        'Global line': 'Global line',
        'Address box type': 'Address box type',
        'Base URL': 'Base URL',
        'API Host': 'API Host',
        'API Path': 'API Path',
        'Full URL': 'Full URL',
        'API Key': 'API Key',
        'Model ID': 'Model ID',
        'Sign in': 'Sign in',
        'Open model pricing': 'Open model pricing',
        'Copy to clipboard': 'Copy to clipboard',
        'Copied!': 'Copied!',
        Copied: 'Copied',
        'The address of the site you are on right now':
          'The address of the site you are on right now',
        'Best for networks in mainland China':
          'Best for networks in mainland China',
        'Cloudflare acceleration for overseas and cross-border networks':
          'Cloudflare acceleration for overseas and cross-border networks',
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
        'Sign in, create a key, then come back and copy these fields.':
          'Sign in, create a key, then come back and copy these fields.',
        'Copy the exact ID from the pricing page':
          'Copy the exact ID from the pricing page',
        'The model ID must match the pricing page character for character.':
          'The model ID must match the pricing page character for character.',
      },
    },
  },
})

function renderHome(props: {
  hasKey: boolean
  keyCount: number
  requestCount: number
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <BeginnerHomeView
          greetingName='yecao'
          hasKey={props.hasKey}
          keyCount={props.keyCount}
          balanceText='$10.00'
          requestCount={props.requestCount}
        />
      </TooltipProvider>
    </I18nextProvider>
  )
}

describe('beginner home', () => {
  test('asks a first-time user to create a key instead of opening charts', () => {
    renderHome({ hasKey: false, keyCount: 0, requestCount: 0 })

    expect(screen.getByText('Hello, yecao')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Create your first key' })
    ).toHaveAttribute('href', '/keys')
    expect(screen.getByText('You do not have a key yet')).toBeInTheDocument()
    expect(screen.queryByText('Usage charts')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Try a chat' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'How to fill this into an app' })
    ).toBeInTheDocument()
  })

  test('shows the key count after the user already has keys', () => {
    renderHome({ hasKey: true, keyCount: 2, requestCount: 8 })

    expect(screen.getByRole('link', { name: 'Manage keys' })).toHaveAttribute(
      'href',
      '/keys'
    )
    expect(screen.getByText('You have 2 keys')).toBeInTheDocument()
    expect(screen.getByText('Used 8 times')).toBeInTheDocument()
  })
})
