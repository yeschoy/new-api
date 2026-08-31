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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

vi.mock('@/features/pricing/hooks/use-pricing-data', () => ({
  usePricingData: () => ({
    models: [],
    groupRatio: {},
    usableGroup: {},
    isLoading: false,
    priceRate: 1,
    usdExchangeRate: 1,
  }),
}))

const { TooltipProvider } = await import('@/components/ui/tooltip')
const { BeginnerHomeView } = await import('../beginner-home')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'First three minutes': 'First three minutes',
        'Put AI into the app you already use':
          'Put AI into the app you already use',
        'Pick a model, choose a rate group, then create a key. Paste the three fields into your software and send 你好.':
          'Pick a model, choose a rate group, then create a key. Paste the three fields into your software and send 你好.',
        'Pick a model': 'Pick a model',
        'This list only includes models your account can use.':
          'This list only includes models your account can use.',
        'Search or pick a model': 'Search or pick a model',
        'Open the model square': 'Open the model square',
        'How to fill this into an app': 'How to fill this into an app',
        'Manage keys': 'Manage keys',
        'You have {{count}} keys': 'You have {{count}} keys',
        Balance: 'Balance',
        'Used {{count}} times': 'Used {{count}} times',
        'Copy to clipboard': 'Copy to clipboard',
        'Copied!': 'Copied!',
        Copied: 'Copied',
        'No matching models': 'No matching models',
        'Loading...': 'Loading...',
      },
    },
  },
})

function renderHome(props: {
  hasKey: boolean
  keyCount: number
  requestCount: number
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
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
    </QueryClientProvider>
  )
}

describe('beginner home', () => {
  test('starts from picking a model instead of opening charts', () => {
    renderHome({ hasKey: false, keyCount: 0, requestCount: 0 })

    expect(
      screen.getByText('Put AI into the app you already use')
    ).toBeInTheDocument()
    expect(screen.getByText('Pick a model')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open the model square' })
    ).toHaveAttribute('href', '/pricing')
    expect(screen.queryByText('Usage charts')).not.toBeInTheDocument()
  })

  test('lets an existing user manage keys without leaving the setup', () => {
    renderHome({ hasKey: true, keyCount: 2, requestCount: 8 })

    expect(screen.getByRole('link', { name: 'Manage keys' })).toHaveAttribute(
      'href',
      '/keys'
    )
    expect(screen.getByText('Used 8 times')).toBeInTheDocument()
  })
})
